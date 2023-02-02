import { useEffect, useReducer, useRef } from "react";
import { createLogger } from "@sky0014/logger";
import { clone, getFunctions } from "./util";
import unstable_batchedUpdates from "unstable_batchedupdates";

const LIB_NAME = "store";

interface ConfigStoreOptions {
  debug?: boolean;
}

let storeOptions: ConfigStoreOptions = {
  debug: false,
};

const logger = createLogger();
logger.initLogger({
  enable: storeOptions.debug,
  prefix: LIB_NAME,
});

function configStore(options: ConfigStoreOptions) {
  Object.assign(storeOptions, options);
  logger.setEnable(storeOptions.debug);
}

interface CreateStoreOptions {
  storeName?: string;
}

interface Computed {
  name: string;
  getter: () => any;
  value: any;
  changed: boolean;
  deps: Map<string, Store>;
}

interface State {
  name: string;
  parent?: State;
  base?: any;
  copy?: any;
  expired?: boolean;
  isRoot?: boolean;
  inner?: State;
  outer?: State;
}

interface SubscribeListener {
  (names: Set<string>): void;
}

interface StoreAdmin {
  computed: Record<string, Computed>;
  pendingChange: Set<State>;
  pendingChangeDirect: Set<string>;
  subscribeListeners: Set<SubscribeListener>;
}

interface Produce {
  (produce: () => any): any;
}

const STATE = Symbol("state");
const ADMIN = Symbol("admin");
const INNER = Symbol("inner");

class Store {
  [STATE]: State;
  [ADMIN]: StoreAdmin;
}

type Unsubscriber = () => boolean;
type ReportDepend = (name: string, store: Store) => void;

interface HookOptions {
  onDepend?: ReportDepend;
}

interface StoreRef<T> {
  store: T;
  dependStores: Map<Store, Unsubscriber>;
  map: Map<string, boolean>;
  unsubscribe: Unsubscriber;
}

// globals
let createStoreCount = 0;
let computedTarget: Computed[] = [];
let computedMap: Record<string, Record<string, Computed>> = {};
let reportDepend: ReportDepend;
let batchedUpdateList: Set<() => any> = new Set();
let batchedUpdateScheduled = false;

function createStore<T extends Record<string, any>>(
  target: T,
  options: CreateStoreOptions = {}
): [T & Store, () => T & Store] {
  let { storeName } = options;

  if (!storeName) {
    storeName = target.constructor.name;
  }

  // 赋予唯一name以便全局标识
  storeName = `${storeName}@S${createStoreCount++}`;

  /** @throws {Error} */
  const die = (msg: string) => {
    throw new Error(`[${LIB_NAME}] [${storeName}] ${msg}`);
  };

  const admin: StoreAdmin = {
    computed: {},
    pendingChange: new Set(),
    pendingChangeDirect: new Set(),
    subscribeListeners: new Set(),
  };

  const reportSubscribe = (name: string, store: Store) => {
    // handle computed
    if (computedTarget.length) {
      if (!computedMap[name]) {
        computedMap[name] = {};
      }
      computedTarget.forEach((val) => {
        computedMap[name][val.name] = val;
        val.deps.set(name, store);
      });
    }

    if (reportDepend) {
      reportDepend(name, store);
    }
  };

  const createProxy = (target: any, name: string, parent: State) => {
    logger.log(`create proxy: ${name}`);

    const state: State = {
      name,
      parent,
      base: target,
    };

    state.inner = new Proxy(state, innerHandle);
    state.outer = new Proxy(state, outerHandle);

    return state.outer;
  };

  const cloneProxy = (state: State) => {
    logger.log(`clone proxy: ${state.name}`);

    state.inner = new Proxy(state, innerHandle);
    state.outer = new Proxy(state, outerHandle);

    return state.outer;
  };

  const setData = (
    isDelete: boolean,
    state: State,
    prop: string | symbol,
    value?: any
  ) => {
    if (typeof prop === "symbol") {
      die(
        `You should not set or delete symbol props(${state.name}.${String(
          prop
        )})!`
      );
      return false;
    }

    const name = `${state.name}.${prop}`;
    logger.log(`${isDelete ? "delete" : "set"} ${name}`);

    const computed = state.isRoot && admin.computed[makeComputedKey(prop)];
    if (computed) {
      die(`You should not set or delete computed props(${name})!`);
      return false;
    }

    // handle computed subscribe
    // compare to latest, so that computed value can be used immediately
    const latestSource = latest(state);
    if (isDelete ? prop in latestSource : latestSource[prop] !== value) {
      // changed
      const subscribes = computedMap[name];
      if (subscribes) {
        Object.keys(subscribes).forEach(
          (key) => (subscribes[key].changed = true)
        );
      }
    }

    // handle state
    // compare to base & copy, will be handled when finalize
    const source = state.base;
    let changed = false;
    if (isDelete ? prop in source : source[prop] !== value) {
      logger.log(`${name} changed`);
      changed = true;
      admin.pendingChangeDirect.add(name);
      admin.pendingChange.add(state);

      if (!state.copy) {
        state.copy = clone(state.base);
      }
      isDelete ? delete state.copy[prop] : (state.copy[prop] = value);
    } else {
      if (
        state.copy &&
        (isDelete ? prop in state.copy : state.copy[prop] !== value)
      ) {
        logger.log(`${name} restored`);
        changed = true;
        admin.pendingChangeDirect.delete(name);
        admin.pendingChange.delete(state);
        isDelete ? delete state.copy[prop] : (state.copy[prop] = value);
      }
    }

    // 改变后即触发finalize, finalize内部会做延迟合并处理
    if (changed) {
      finalize(admin);
    }

    return true;
  };

  const makeHandler = ({ inner }: { inner: boolean }) => {
    const handler: ProxyHandler<State> = {
      get(state, prop, receiver) {
        if (prop === STATE) {
          return state;
        }

        if (prop === ADMIN) {
          return admin;
        }

        if (prop === INNER) {
          return inner;
        }

        if (prop === "toJSON") {
          return () => latest(state);
        }

        const source = latest(state);

        if (typeof prop === "symbol") {
          // maybe some internal symbol such as: Symbol.toStringTag

          // toStringTag return storeName: [object storeName]
          if (prop === Symbol.toStringTag) {
            return storeName;
          }

          // other return original
          return source[prop];
        }

        const name = `${state.name}.${prop}`;
        const computed = state.isRoot && admin.computed[makeComputedKey(prop)];

        let value: any;

        if (computed) {
          if (computed.changed) {
            // 如改变，则重新收集依赖
            computed.deps.forEach(
              (_, name) => delete computedMap[name][computed.name]
            );
            computed.deps.clear();

            computedTarget.push(computed);
            computed.value = computed.getter();
            computed.changed = false;
            computedTarget.pop();
          } else {
            // 未改变，将当前的依赖作为其他collectTarget的依赖
            computed.deps.forEach((store, name) =>
              reportSubscribe(name, store)
            );
          }
          return computed.value;
        }

        value = source[prop];
        if (typeof value !== "function") {
          // computed、action不用subscribe
          reportSubscribe(name, store);
        }

        if (!value || typeof value !== "object") {
          return value;
        }

        const isInner = receiver[INNER];
        const valueState: State = value[STATE];

        if (!valueState) {
          value = source[prop] = createProxy(value, name, state);
        } else if (valueState.expired) {
          delete valueState.expired;
          value = source[prop] = cloneProxy(valueState);
        }

        if (isInner) {
          value = value[STATE].inner;
        }

        return value;
      },

      set(state, prop, value) {
        return setData(false, state, prop, value);
      },

      getPrototypeOf(state) {
        return Object.getPrototypeOf(state.base);
      },

      setPrototypeOf() {
        die(`You should not do "setPrototypeOf" of a store!`);
        return false;
      },

      has(state, prop) {
        return prop in latest(state);
      },

      deleteProperty(state, prop) {
        return setData(true, state, prop);
      },

      ownKeys(state) {
        return Object.getOwnPropertyNames(latest(state));
      },

      defineProperty() {
        die(`You should not do "defineProperty" of a store!`);
        return false;
      },

      getOwnPropertyDescriptor(state, prop) {
        const desc = Object.getOwnPropertyDescriptor(latest(state), prop);
        if (!desc) return desc;
        // May cause error: TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for property 'length' which is either non-existent or configurable in the proxy target
        // Workaround: set configurable=true
        return { ...desc, configurable: true };
      },
    };

    return handler;
  };

  const innerHandle: ProxyHandler<State> = makeHandler({ inner: true });
  const outerHandle: ProxyHandler<State> = {
    ...makeHandler({ inner: false }),
    set(state, prop) {
      die(
        `Do not allowed modify data(${state.name}.${String(
          prop
        )}) directly, you should do it in store actions!`
      );
      return false;
    },

    deleteProperty(state, prop) {
      die(
        `Do not allowed modify data(${state.name}.${String(
          prop
        )}) directly, you should do it in store actions!`
      );
      return false;
    },
  };

  // root state
  const state: State = {
    name: storeName,
    base: target,
    isRoot: true,
  };

  // innerStore仅内部使用（主要用于actions），允许直接改变store prop
  const innerStore = new Proxy(state, innerHandle);
  // 暴露给外部的store不允许直接改变store prop
  const outerStore = new Proxy(state, outerHandle);

  const produce: Produce = (produceFunc: () => any) =>
    internalProduce(innerStore as any, produceFunc);

  // check symbol
  const symbols = Object.getOwnPropertySymbols(target);
  if (symbols.length) {
    logger.warn("checked symbol in store:", symbols);
    die("Symbol in store not supported!");
  }

  // get all computed & actions
  const map = getFunctions(target);
  Object.keys(map).some((key) => {
    const desc = map[key];

    if (desc.set) {
      die(`Do not allow setter(${key}) in Store!`);
      return true;
    }

    if (desc.get) {
      // handle computed
      const name = makeComputedKey(key);
      admin.computed[name] = {
        name,
        getter: desc.get.bind(outerStore),
        value: undefined,
        changed: true,
        deps: new Map(),
      };
    } else {
      // handle actions
      if (typeof desc.value === "function") {
        const func = desc.value.bind(innerStore);
        // @ts-ignore
        target[key] = (...args: any[]) => {
          logger.log(`call action: ${storeName}.${key}`, ...args);
          return produce(() => func(...args));
        };
      }
    }
  });

  const store = outerStore as any as T & Store;
  const useTargetStore = () => useStore(store);

  return [store, useTargetStore];
}

function makeComputedKey(prop: string) {
  return "@" + prop;
}

function latest(state: State) {
  return state.copy || state.base;
}

function subscribeStore(store: Store, listener: SubscribeListener) {
  const admin = store[ADMIN];
  admin.subscribeListeners.add(listener);
  return () => admin.subscribeListeners.delete(listener);
}

function handleChanged(state: State) {
  state.expired = true;

  if (state.copy) {
    state.base = state.copy;
    delete state.copy;
  }

  if (state.parent) {
    handleChanged(state.parent);
  }
}

function finalize(admin: StoreAdmin) {
  // 延迟更新，可以合并多个同步的action，减少不必要渲染
  if (!batchedUpdateScheduled) {
    batchedUpdateScheduled = true;

    Promise.resolve().then(() => {
      logger.log("finalize...");

      batchedUpdateScheduled = false;

      admin.pendingChange.forEach(handleChanged);
      admin.pendingChange.clear();

      if (admin.subscribeListeners.size && admin.pendingChangeDirect.size) {
        const cloned = new Set(admin.pendingChangeDirect);
        const clonedListeners = new Set(admin.subscribeListeners);
        clonedListeners.forEach((func) => func(cloned));
      }
      admin.pendingChangeDirect.clear();

      const list = new Set(batchedUpdateList);
      batchedUpdateList.clear();

      if (list.size) {
        // 批量更新，减少不必要渲染
        unstable_batchedUpdates(() => {
          list.forEach((func) => func());
        });
      }
    });
  }
}

function hookStore<T extends Store>(store: T, options: HookOptions): T {
  const map = new WeakMap();

  const handle: ProxyHandler<any> = {
    get(target, prop) {
      if (typeof prop === "symbol") {
        return target[prop];
      }

      reportDepend = options.onDepend;
      const value = target[prop];
      reportDepend = undefined;

      if (!value || typeof value !== "object") {
        return value;
      }

      // 缓存起来，防止每次都生成新对象，造成react hooks dependencies不一致
      if (!map.has(value)) {
        map.set(value, new Proxy(value, handle));
      }

      return map.get(value);
    },
  };

  return new Proxy(store, handle);
}

function internalProduce(store: Store, produce: () => any) {
  const admin = store[ADMIN];
  const result = produce();
  finalize(admin);
  return result;
}

function useStore<T extends Store>(store: T) {
  const storeRef = useRef<StoreRef<T>>();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  if (!storeRef.current) {
    const checkUpdate: SubscribeListener = (names) => {
      for (let name of names) {
        if (storeRef.current.map.has(name)) {
          batchedUpdateList.add(forceUpdate);
          break;
        }
      }
    };

    const proxy = hookStore(store, {
      onDepend: (name, store2) => {
        storeRef.current.map.set(name, true);
        if (store2 !== store && !storeRef.current.dependStores.has(store2)) {
          const unsubscribe = subscribeStore(store2, checkUpdate);
          storeRef.current.dependStores.set(store2, unsubscribe);
        }
      },
    });

    const unsubscribe = subscribeStore(store, checkUpdate);

    storeRef.current = {
      store: proxy,
      dependStores: new Map(),
      map: new Map(),
      unsubscribe,
    };
  }

  // 每次render清理，重新收集依赖
  storeRef.current.map.clear();
  // 清理依赖store
  if (storeRef.current.dependStores.size) {
    storeRef.current.dependStores.forEach((unsubscribe) => unsubscribe());
    storeRef.current.dependStores.clear();
  }

  useEffect(() => {
    return () => {
      // unmount清理
      storeRef.current?.unsubscribe();
      storeRef.current?.dependStores.forEach((unsubscribe) => unsubscribe());
      storeRef.current = undefined;
    };
  }, []);

  return storeRef.current.store;
}

export {
  Store,
  Produce,
  createStore,
  subscribeStore,
  hookStore,
  useStore,
  configStore,
  logger,
  internalProduce,
};
