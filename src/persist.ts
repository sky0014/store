import {
  StoreWrap,
  subscribeStore,
  _internalProduce,
  logger as _logger,
} from "./core";

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

export async function persist<T extends Record<string, any>>(
  store: StoreWrap<T>,
  options: PersistOptions<T>
) {
  const logger = _logger.makeLogger("persist", options.key);
  // 所有属性
  const allProps = Object.getOwnPropertyNames(store);
  // 要存储的属性
  let storeProps = new Set(allProps);

  if (options.whiteList?.length) {
    // 白名单（优先）
    const whiteList = options.whiteList as string[];
    storeProps = new Set(
      allProps.filter((prop) => whiteList.indexOf(prop) !== -1)
    );
  } else if (options.blackList?.length) {
    // 黑名单
    const blackList = options.blackList as string[];
    storeProps = new Set(
      allProps.filter((prop) => blackList.indexOf(prop) === -1)
    );
  }

  // 默认全部监听
  let shouldStore: (names: Set<string>) => boolean = () => true;
  // 有黑白名单的情况下进行选择过滤
  if (storeProps.size !== allProps.length) {
    const map: Record<string, boolean> = {};
    storeProps.forEach((prop) => (map[prop] = true));
    shouldStore = (names) => {
      for (let n of names) {
        const prop = n.split(".")[1];
        if (map[prop]) {
          return true;
        }
      }
      return false;
    };
  }

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
        json = options.onVerUpdate(json.ver, json);
      }
      _internalProduce(store, () => {
        storeProps.forEach((prop) => {
          const val = json.data[prop];
          if (val !== undefined) {
            // @ts-ignore
            store[prop] = val;
          }
        });
      });
    } catch (e) {
      logger.warn(`parse storage data error: `, e);
    }
  }

  // 监听store变化
  let hasChanged = false;
  let isStoreing = false;
  const checkStore = async () => {
    if (!hasChanged || isStoreing) {
      return;
    }

    const data: Record<string, any> = {};
    storeProps.forEach((prop) => (data[prop] = store[prop]));
    hasChanged = false;
    isStoreing = true;
    logger.log("set storage: ", data);

    const storeData: StoreData = {
      __store__: true,
      ver: options.ver,
      data,
    };
    await options.storage.setItem(options.key, JSON.stringify(storeData));
    isStoreing = false;
    checkStore();
  };

  subscribeStore(store, (names) => {
    if (storeProps.size && shouldStore(names)) {
      hasChanged = true;
      checkStore();
    }
  });
}
