import promiseFinally from "promise.prototype.finally";
import { subscribeStore, innerProduce, logger as _logger, Store } from "./core";
import { delay } from "./util";

promiseFinally.shim();

type GetProp<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
};

type GetValue<T> = T[keyof T];

export interface PersistStorage {
  getItem: (key: string) => string | null | Promise<any>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

interface PersistOptions<T> {
  key: string;
  ver: number;
  storage: PersistStorage;
  blackList?: Array<GetValue<GetProp<T>>>;
  whiteList?: Array<GetValue<GetProp<T>>>;
  onVerUpdate?: (oldVer: number, data: any) => any;
  flushInterval?: number;
}

interface StoreData {
  __store__: boolean;
  ver: number;
  data: any;
}

export async function persist<T extends Store>(
  store: T,
  options: PersistOptions<T>
) {
  const logger = _logger.makeLogger("persist", options.key);
  const flushInterval = options.flushInterval ?? 200;

  let filterProps: (prop: string) => boolean = () => true;

  if (options.whiteList?.length) {
    // 白名单（优先）
    const whiteList = options.whiteList as string[];
    filterProps = (prop) => whiteList.indexOf(prop) !== -1;
  } else if (options.blackList?.length) {
    // 黑名单
    const blackList = options.blackList as string[];
    filterProps = (prop) => blackList.indexOf(prop) === -1;
  }

  const getProps = () => {
    // 所有属性
    const allProps = Object.getOwnPropertyNames(store).filter(
      (prop) => typeof (store as any)[prop] !== "function"
    );
    // 要存储的属性
    const storeProps = new Set(allProps.filter(filterProps));
    return { allProps, storeProps };
  };

  // 读取本地存储
  try {
    const stored = await options.storage.getItem(options.key);
    if (stored) {
      logger.log("read from storage: ", stored);

      let json = JSON.parse(stored) as StoreData;
      if (!json.__store__) {
        throw new Error(`invalid store data: ${stored}`);
      }
      if (json.ver !== options.ver && options.onVerUpdate) {
        json.data = options.onVerUpdate(json.ver, json.data);
      }
      innerProduce(store, (inner) => {
        Object.keys(json.data).forEach((prop) => {
          if (filterProps(prop)) {
            // @ts-ignore
            inner[prop] = json.data[prop];
          }
        });
      });
    }
  } catch (e) {
    logger.warn(`read storage data error: `, e);
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`read storage data error: ${e}`);
    }
  }

  let hasChanged = false;
  let isStoring = false;
  let cur: Promise<void>;
  let next: Promise<void>;

  const flush = async () => {
    if (!hasChanged) {
      if (isStoring) {
        return cur;
      }
      return;
    }

    if (isStoring) {
      next ||= cur.finally(flush);
      return next;
    }

    hasChanged = false;
    isStoring = true;

    const data: Record<string, any> = {};
    const { storeProps } = getProps();
    storeProps.forEach((prop) => (data[prop] = (store as any)[prop]));
    const storeData: StoreData = {
      __store__: true,
      ver: options.ver,
      data,
    };
    const dataStr = JSON.stringify(storeData);
    logger.log("set storage");

    cur = Promise.resolve()
      .then(() => options.storage.setItem(options.key, dataStr))
      .finally(() => {
        isStoring = false;
        cur = null;
        next = null;
      });

    return cur;
  };

  let flushing = false;
  const checkStore = async () => {
    if (flushing) {
      return;
    }

    flushing = true;
    await flush();
    if (flushInterval > 0) {
      await delay(flushInterval);
    }
    flushing = false;

    if (hasChanged) {
      checkStore();
    }
  };

  // 监听store变化
  const cancel = subscribeStore(store, (names) => {
    const { allProps, storeProps } = getProps();

    if (
      storeProps.size &&
      (allProps.length === storeProps.size || shouldStore(names, storeProps))
    ) {
      hasChanged = true;
      checkStore();
    }
  });

  return { flush, cancel };
}

function shouldStore(names: Set<string>, props: Set<string>) {
  for (let n of names) {
    const prop = n.split(".")[1];
    if (props.has(prop)) {
      return true;
    }
  }
  return false;
}
