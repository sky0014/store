import {
  subscribeStore,
  internalProduce,
  logger as _logger,
  Store,
} from "./core";
import { delay } from "./util";

type GetProp<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
};

type GetValue<T> = T[keyof T];

interface PersistStorage {
  getItem: (key: string) => string | Promise<any>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

interface PersistOptions<T> {
  key: string;
  ver: number;
  storage: PersistStorage;
  blackList?: Array<GetValue<GetProp<T>>>;
  whiteList?: Array<GetValue<GetProp<T>>>;
  onVerUpdate?: (oldVer: number, data: any) => any;
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

  let filterProps: (prop: string) => boolean;

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
    const storeProps = new Set(
      filterProps ? allProps.filter(filterProps) : allProps
    );
    return { allProps, storeProps };
  };

  // 读取本地存储
  const stored = await options.storage.getItem(options.key);
  if (stored) {
    try {
      logger.log("read from storage: ", stored);

      let json = JSON.parse(stored) as StoreData;
      if (!json.__store__) {
        throw new Error(`invalid store data: ${stored}`);
      }
      if (json.ver !== options.ver && options.onVerUpdate) {
        json.data = options.onVerUpdate(json.ver, json.data);
      }
      internalProduce(store, () => {
        Object.keys(json.data).forEach((prop) => {
          if (filterProps(prop)) {
            // @ts-ignore
            store[prop] = json.data[prop];
          }
        });
      });
    } catch (e) {
      logger.warn(`read storage data error: `, e);
    }
  }

  const flush = async () => {
    const data: Record<string, any> = {};
    const { storeProps } = getProps();
    storeProps.forEach((prop) => (data[prop] = (store as any)[prop]));
    const storeData: StoreData = {
      __store__: true,
      ver: options.ver,
      data,
    };
    const dataStr = JSON.stringify(storeData);
    logger.log("set storage: ", dataStr);
    await options.storage.setItem(options.key, dataStr);
  };

  let hasChanged = false;
  let isStoreing = false;
  const checkStore = async () => {
    if (!hasChanged || isStoreing) {
      return;
    }

    hasChanged = false;
    isStoreing = true;
    await flush();
    await delay(200); // delay防止频繁set storage
    isStoreing = false;
    checkStore();
  };

  // 监听store变化
  subscribeStore(store, (names) => {
    const { allProps, storeProps } = getProps();

    if (
      storeProps.size &&
      (allProps.length === storeProps.size || shouldStore(names, storeProps))
    ) {
      hasChanged = true;
      checkStore();
    }
  });

  return { flush };
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
