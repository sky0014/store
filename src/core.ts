import { createLogger } from "@sky0014/logger";
import { clone, isAsyncAction } from "./util";

const LIB_NAME = "store";

const logger = createLogger();
logger.initLogger({
  enable: false,
  prefix: LIB_NAME,
});

interface CreateStoreOptions {
  debug?: boolean;
  storeName?: string;
}

interface Computed {
  name: string;
  getter: () => any;
  value: any;
  changed: boolean;
  deps: Set<string>;
}

interface State {
  name: string;
  parent?: State;
  base?: any;
  copy?: any;
  expired?: boolean;
  revoke?: () => void;
}

interface SubscribeListener {
  (names: Set<string>): void;
}

interface StoreAdmin {
  subscribeMap: Record<string, Record<string, Computed>>;
  computed: Record<string, Computed>;
  collectTarget: Computed[];
  allowChange: boolean;
  pendingChange: Set<State>;
  pendingChangeDirect: Set<string>;
  subscribeListeners: Set<SubscribeListener>;
  reportDepend?: (name: string) => void;
}

interface Produce {
  (func: () => any): any;
}

const STATE = Symbol("state");
const ADMIN = Symbol("admin");

interface Store {
  [STATE]: State;
  [ADMIN]: StoreAdmin;
}

type StoreWrap<T> = {
  [K in keyof T]: T[K] extends (
    arg0: any,
    ...args: infer P1
  ) => Promise<infer P2>
    ? (...args: P1) => Promise<P2>
    : T[K];
} & Store;

interface HookOptions {
  onDepend?: (name: string) => void;
}

function createStore<T extends object>(
  target: T,
  options: CreateStoreOptions = {}
): StoreWrap<T> {
  let { debug, storeName } = options;

  if (debug) {
    logger.setEnable(true);
  }

  if (!storeName) {
    storeName = target.constructor.name;
  }

  const admin: StoreAdmin = {
    subscribeMap: {},
    computed: {},
    collectTarget: [],
    allowChange: false,
    pendingChange: new Set(),
    pendingChangeDirect: new Set(),
    subscribeListeners: new Set(),
  };

  const reportSubscribe = (name: string) => {
    if (admin.collectTarget.length) {
      if (!admin.subscribeMap[name]) {
        admin.subscribeMap[name] = {};
      }
      admin.collectTarget.forEach((val) => {
        admin.subscribeMap[name][val.name] = val;
        val.deps.add(name);
      });
    }

    if (admin.reportDepend) {
      admin.reportDepend(name);
    }
  };

  const createProxy = (target: any, name: string, parent: State) => {
    const state: State = {
      name,
      parent,
      base: target,
    };

    logger.log(`create proxy: ${name}`);

    const { proxy, revoke } = Proxy.revocable(state, handle);
    state.revoke = revoke;

    return proxy;
  };

  const cloneProxy = (state: State) => {
    logger.log(`clone proxy: ${state.name}`);

    const { proxy, revoke } = Proxy.revocable(state, handle);
    state.revoke && state.revoke();
    state.revoke = revoke;

    return proxy;
  };

  const setData = (
    isDelete: boolean,
    state: State,
    prop: string,
    value?: any
  ) => {
    const name = `${state.name}.${prop}`;
    logger.log(`${isDelete ? "delete" : "set"} ${name}`);

    const source = state.base;
    if (isDelete ? prop in source : source[prop] !== value) {
      logger.log(`${name} changed`);
      admin.pendingChangeDirect.add(name);
      admin.pendingChange.add(state);

      if (!state.copy) {
        state.copy = clone(state.base);
      }
      isDelete ? delete state.copy[prop] : (state.copy[prop] = value);

      const subscribes = admin.subscribeMap[name];
      if (subscribes) {
        Object.keys(subscribes).forEach(
          (key) => (subscribes[key].changed = true)
        );
      }
    } else {
      if (
        state.copy &&
        (isDelete ? prop in state.copy : state.copy[prop] !== value)
      ) {
        logger.log(`${name} restored`);
        admin.pendingChangeDirect.delete(name);
        admin.pendingChange.delete(state);
        isDelete ? delete state.copy[prop] : (state.copy[prop] = value);

        const subscribes = admin.subscribeMap[name];
        if (subscribes) {
          Object.keys(subscribes).forEach(
            (key) => (subscribes[key].changed = false)
          );
        }
      }
    }
  };

  const handle: ProxyHandler<State> = {
    get(state, prop) {
      if (prop === STATE) {
        return state;
      }

      if (prop === ADMIN) {
        return admin;
      }

      if (typeof prop === "symbol") {
        return die(`symbol in store not supported!`);
      }

      const name = `${state.name}.${prop}`;
      const computed = !state.parent && admin.computed[makeComputedKey(prop)];
      const source = latest(state);
      let value: any;

      if (computed) {
        if (computed.changed) {
          // 如改变，则重新收集依赖
          for (let name of computed.deps) {
            delete admin.subscribeMap[name][computed.name];
          }
          computed.deps.clear();

          admin.collectTarget.push(computed);
          computed.value = computed.getter();
          computed.changed = false;
          admin.collectTarget.pop();
        } else {
          // 未改变，将当前的依赖作为其他collectTarget的依赖
          computed.deps.forEach(reportSubscribe);
        }
        value = computed.value;
      } else {
        value = source[prop];
      }

      if (!computed && typeof value !== "function") {
        // computed、action不用subscribe
        reportSubscribe(name);
      }

      if (!value || typeof value !== "object") {
        return value;
      }

      const valueState: State = value[STATE];

      if (!valueState) {
        value = source[prop] = createProxy(value, name, state);
      } else if (valueState.expired) {
        delete valueState.expired;
        value = source[prop] = cloneProxy(valueState);
      }

      return value;
    },

    set(state, prop, value) {
      if (!admin.allowChange) {
        die(
          "Do not allowed modify data directly, you should do it in actions!"
        );
        return false;
      }

      if (typeof prop === "symbol") {
        die(`symbol in store not supported!`);
        return false;
      }

      setData(false, state, prop, value);

      return true;
    },

    getPrototypeOf(state) {
      return Object.getPrototypeOf(state.base);
    },

    has(state, prop) {
      return prop in latest(state);
    },

    deleteProperty(state, prop) {
      if (!admin.allowChange) {
        die(
          "Do not allowed modify data directly, you should do it in actions!"
        );
        return false;
      }

      if (typeof prop === "symbol") {
        die(`symbol in store not supported!`);
        return false;
      }

      setData(true, state, prop);

      return true;
    },

    ownKeys(state) {
      return Object.getOwnPropertyNames(latest(state));
    },
  };

  // root state
  const state: State = {
    name: storeName,
    base: target,
  };
  const { proxy, revoke } = Proxy.revocable(state, handle);
  state.revoke = revoke;

  const produce = (func: () => any) => {
    admin.allowChange = true;
    const result = func();
    admin.allowChange = false;
    finalize(admin);
    return result;
  };

  const descObj = Object.getOwnPropertyDescriptors(
    Object.getPrototypeOf(target)
  );
  Object.keys(descObj).forEach((key) => {
    if (key === "constructor") {
      return;
    }

    const desc = descObj[key];
    if (desc.get) {
      // handle computed
      const name = makeComputedKey(key);
      admin.computed[name] = {
        name,
        getter: desc.get.bind(proxy),
        value: undefined,
        changed: true,
        deps: new Set(),
      };
    } else {
      // handle actions
      if (typeof desc.value === "function") {
        const func = desc.value.bind(proxy);
        // use original desc.value, func.toString() maybe [native code]
        if (isAsyncAction(desc.value)) {
          // @ts-ignore
          target[key] = (...args: any[]) => {
            logger.log(`call async action: ${storeName}.${key}`, args);
            return func(produce, ...args);
          };
        } else {
          // @ts-ignore
          target[key] = (...args: any[]) => {
            logger.log(`call action: ${storeName}.${key}`, args);
            return produce(() => func(...args));
          };
        }
      }
    }
  });

  return proxy as any;
}

function makeComputedKey(prop: string) {
  return "@" + prop;
}

function die(msg: string) {
  throw new Error(`[${LIB_NAME}] ${msg}`);
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
  admin.pendingChange.forEach(handleChanged);
  admin.pendingChange.clear();

  if (admin.subscribeListeners.size && admin.pendingChangeDirect.size) {
    const cloned = new Set(admin.pendingChangeDirect);
    admin.subscribeListeners.forEach((func) => func(cloned));
  }
  admin.pendingChangeDirect.clear();
}

function hookStore<T extends Store>(store: T, options: HookOptions) {
  const admin = store[ADMIN];
  const map = new WeakMap();

  const handle: ProxyHandler<any> = {
    get(target, prop) {
      if (typeof prop === "symbol") {
        return target[prop];
      }

      const temp = admin.reportDepend;
      admin.reportDepend = options.onDepend;
      const value = target[prop];
      admin.reportDepend = temp;

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

  const { proxy, revoke } = Proxy.revocable(store, handle);

  return { proxy: proxy as any as T, revoke };
}

export { Produce, Store, createStore, subscribeStore, hookStore };
