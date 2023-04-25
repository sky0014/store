import {
  ComponentClass,
  FC,
  FunctionComponent,
  NamedExoticComponent,
  createElement,
  memo,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { createLogger } from "@sky0014/logger";
import { arrayPatch, clone, getFunctions, replaceWithKeys } from "./util";
import unstable_batchedUpdates from "unstable_batchedupdates";

const LIB_NAME = "store";
const STATE = Symbol("state");
const ADMIN = Symbol("admin");
const INNER = Symbol("inner");
const OBSERVED = Symbol("observed");

type Subscriber = () => void;
type SubscribeListener = (names: Set<string>) => void;
type Unsubscriber = () => void;
type ReportDepend = (prop: Prop, options?: { isDeep?: boolean }) => void;

interface ConfigStoreOptions {
  debug?: boolean;
}

interface CreateStoreOptions {
  storeName?: string;
}

interface Prop {
  name: string;
  isKeys: boolean;
  computers: Set<Computed>;
  subscribers: Set<Subscriber>;
  deepSubscribers: Set<Subscriber>;
  keysProp?: Prop;
}

interface Computed {
  name: string;
  getter: () => any;
  value: any;
  changed: boolean;
  deps: Set<Prop>;
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

interface Store {
  [STATE]: State;
  [ADMIN]: StoreAdmin;
}

interface StoreAdmin {
  computed: Record<string, Computed>;
  subscribeListeners: Set<SubscribeListener>;
  innerStore: Store;
  storeName: string;
}

interface StoreRef {
  onDepend: ReportDepend;
  unsubscribe: Unsubscriber;
  unsubscribeList: Unsubscriber[];
}

interface handleChangedParam {
  state: State;
  storeName: string;
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

// globals
// store计数
let createStoreCount = 0;
// 所有被监听的props，以store分割，以提高效率 { storeName: { propName: Prop } ... }
// 特例：.keys()
let storeProps: Record<string, Record<string, Prop>> = {};
let computedTarget: Computed[] = [];
let reportDepend: ReportDepend;
let batchedUpdateList: Set<Subscriber> = new Set();
let batchedUpdateScheduled = false;
let pendingChanged: Map<
  Prop,
  { prop: Prop; state: State; admin: StoreAdmin; propName: string }
> = new Map();

/* istanbul ignore next */
function resetStore() {
  storeProps = {};
  computedTarget = [];
  reportDepend = undefined;
  batchedUpdateList = new Set();
  batchedUpdateScheduled = false;
  pendingChanged = new Map();
}

function getStoreProp(storeName: string, name: string, isKeys = false) {
  let props = storeProps[storeName];
  let prop: Prop;

  if (isKeys) {
    name += ".keys()";
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        name,
        isKeys: true,
        computers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
    }
  } else {
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        name,
        isKeys: false,
        computers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
    }
  }

  return prop;
}

function createStore<T extends Record<string, any>>(
  target: T,
  options: CreateStoreOptions = {}
): T & Store {
  let { storeName } = options;

  if (!storeName) {
    storeName = target.constructor.name;
  }

  // 赋予唯一name以便全局标识
  storeName = `${storeName}@S${createStoreCount++}`;
  // store监听的props
  const props: Record<string, Prop> = (storeProps[storeName] = {});

  const die = (msg: string) => {
    throw new Error(`[${LIB_NAME}] [${storeName}] ${msg}`);
  };

  const admin: StoreAdmin = {
    computed: {},
    subscribeListeners: new Set(),
    innerStore: null,
    storeName,
  };

  const getProp = (name: string, isKeys = false) =>
    getStoreProp(storeName, name, isKeys);

  const getKeysProp = (name: string) => {
    const prop = props[name];
    if (prop.keysProp) {
      return prop.keysProp;
    }

    const keys = replaceWithKeys(name);
    const keysProp = props[keys];
    if (keysProp) {
      prop.keysProp = keysProp;
    }

    return keysProp;
  };

  const reportSubscribe = (
    name: string,
    { isKeys = false, isDeep = false } = {}
  ) => {
    const prop = getProp(name, isKeys);

    // handle computed
    if (computedTarget.length) {
      computedTarget.forEach((computed) => {
        prop.computers.add(computed);
        computed.deps.add(prop);
      });
    }

    if (reportDepend) {
      reportDepend(prop, { isDeep });
    }
  };

  const createProxy = (target: any, name: string, parent: State) => {
    logger.log(`create proxy: ${name}`);

    const state: State = {
      name,
      parent,
      base: target,
    };

    state.inner = makeProxy({ state, inner: true });
    state.outer = makeProxy({ state, inner: false });

    return state.outer;
  };

  const cloneProxy = (state: State) => {
    logger.log(`clone proxy: ${state.name}`);

    state.inner = makeProxy({ state, inner: true });
    state.outer = makeProxy({ state, inner: false });

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
      /* istanbul ignore next */
      return false;
    }

    const name = `${state.name}.${prop}`;
    logger.log(`${isDelete ? "delete" : "set"} ${name}`);

    const computed = state.isRoot && admin.computed[name];
    if (computed) {
      die(`You should not set or delete computed props(${name})!`);
    }

    const source = latest(state);
    if (
      isDelete
        ? prop in source
        : source[prop] !== value || (prop === "length" && Array.isArray(source)) // array.length特例：array修改时，length会自动变化，需要监听
    ) {
      // changed
      logger.log(`${name} changed`);

      const sProp = getProp(name);

      // handle computed
      // computed should be updated immediately because it's value maybe used immediately
      // prop self
      sProp?.computers.forEach((sub) => (sub.changed = true));
      // prop keys
      const keysProp = getKeysProp(name);
      keysProp?.computers.forEach((sub) => (sub.changed = true));

      // handle state
      pendingChanged.set(sProp, {
        prop: sProp,
        state,
        admin,
        propName: prop,
      });
      if (!state.copy) {
        state.copy = clone(state.base);
      }
      isDelete ? delete state.copy[prop] : (state.copy[prop] = value);

      // 改变后触发finalize, finalize内部会做延迟合并处理
      finalize();
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
          // return () => latest(state);
          return undefined;
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
        const computed = state.isRoot && admin.computed[name];

        let value: any;

        if (computed) {
          if (computed.changed) {
            // 如改变，则重新收集依赖
            computed.deps.forEach((prop) => prop.computers.delete(computed));
            computed.deps.clear();

            computedTarget.push(computed);
            try {
              computed.value = computed.getter(); // maybe exception
            } finally {
              computed.changed = false;
              computedTarget.pop();
            }
          } else {
            // 未改变，将当前的依赖作为其他collectTarget的依赖
            computed.deps.forEach((prop) =>
              reportSubscribe(prop.name, { isKeys: prop.isKeys })
            );
          }
          return computed.value;
        }

        value = source[prop];
        if (typeof value !== "function") {
          // computed、action不用subscribe
          reportSubscribe(name);
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
        /* istanbul ignore next */
        return false;
      },

      has(state, prop) {
        return prop in latest(state);
      },

      deleteProperty(state, prop) {
        return setData(true, state, prop);
      },

      ownKeys(state) {
        reportSubscribe(state.name, { isKeys: true });
        return Object.getOwnPropertyNames(latest(state));
      },

      defineProperty() {
        die(`You should not do "defineProperty" of a store!`);
        /* istanbul ignore next */
        return false;
      },

      getOwnPropertyDescriptor(state, prop) {
        const desc = Object.getOwnPropertyDescriptor(latest(state), prop);
        /* istanbul ignore next */
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
      /* istanbul ignore next */
      return false;
    },

    deleteProperty(state, prop) {
      die(
        `Do not allowed modify data(${state.name}.${String(
          prop
        )}) directly, you should do it in store actions!`
      );
      /* istanbul ignore next */
      return false;
    },
  };
  const innerArrayHandle = arrayPatch(innerHandle);
  const outerArrayHandle = arrayPatch(outerHandle);

  const makeProxy = ({ state, inner }: { state: State; inner: boolean }) => {
    let t: any = state;
    let h = inner ? innerHandle : outerHandle;
    if (Array.isArray(state.base)) {
      // array特殊处理，让Json序列化及类型判断等能正常运作
      t = [state];
      h = inner ? innerArrayHandle : outerArrayHandle;
    }
    return new Proxy(t, h);
  };

  // root state
  const state: State = {
    name: storeName,
    base: target,
    isRoot: true,
  };

  // innerStore仅内部使用（主要用于actions），允许直接改变store prop
  const innerStore = makeProxy({ state, inner: true });
  // 暴露给外部的store不允许直接改变store prop
  const outerStore = makeProxy({ state, inner: false });

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
    }

    if (desc.get) {
      // handle computed
      const name = `${storeName}.${key}`;
      admin.computed[name] = {
        name,
        getter: desc.get.bind(outerStore),
        value: undefined,
        changed: true,
        deps: new Set(),
      };
    } else {
      // handle actions
      if (typeof desc.value === "function") {
        const func = desc.value.bind(innerStore);
        // @ts-ignore
        target[key] = (...args: any[]) => {
          logger.log(`call action: ${storeName}.${key}`, ...args);
          return func(...args);
        };
      }
    }
  });

  // save innerStore
  admin.innerStore = innerStore as any as Store;

  const store = outerStore as any as T & Store;

  return store;
}

function latest(state: State) {
  return state.copy || state.base;
}

function subscribeStore(store: Store, listener: SubscribeListener) {
  const admin = store[ADMIN];
  admin.subscribeListeners.add(listener);
  return () => admin.subscribeListeners.delete(listener);
}

function handleChanged({ state, storeName }: handleChangedParam) {
  state.expired = true;

  if (state.copy) {
    state.base = state.copy;
    delete state.copy;
  }

  const props = storeProps[storeName];
  const prop = props[state.name];
  if (prop?.deepSubscribers?.size) {
    prop.deepSubscribers.forEach((sub) => batchedUpdateList.add(sub));
  }

  if (state.parent) {
    handleChanged({ state: state.parent, storeName });
  }
}

function finalize() {
  // 延迟更新，可以合并多个同步的action，减少不必要渲染
  if (!batchedUpdateScheduled) {
    batchedUpdateScheduled = true;

    Promise.resolve().then(() => {
      batchedUpdateScheduled = false;

      /* istanbul ignore next */
      if (!pendingChanged.size) return;

      const changedStates = new Map<Prop, handleChangedParam>();
      const names = new Set<string>();
      const subscribeListeners = new Set<SubscribeListener>();
      pendingChanged.forEach(({ prop, state, admin, propName }) => {
        if (
          state.base &&
          state.copy &&
          typeof state.base === "object" &&
          state.base[propName] !== state.copy[propName]
        ) {
          // changed
          changedStates.set(prop, { state, storeName: admin.storeName });
          names.add(admin.storeName);
          admin.subscribeListeners.forEach((sub) =>
            subscribeListeners.add(sub)
          );
          prop.subscribers.forEach((sub) => batchedUpdateList.add(sub));
          prop.keysProp?.subscribers.forEach((sub) =>
            batchedUpdateList.add(sub)
          );
        }
      });
      pendingChanged.clear();

      if (!changedStates.size) {
        return;
      }

      logger.log("finalize...", ...names);

      changedStates.forEach(handleChanged);

      if (subscribeListeners.size) {
        const names = new Set(
          [...changedStates.keys()].map((prop) => prop.name)
        );
        subscribeListeners.forEach((listener) => listener(names));
      }

      if (batchedUpdateList.size) {
        const list = new Set(batchedUpdateList);
        batchedUpdateList.clear();

        // 批量更新，减少不必要渲染
        unstable_batchedUpdates(() => {
          list.forEach((func) => func());
        });
      }
    });
  }
}

function innerProduce<T extends Store>(store: T, produce: (inner: T) => any) {
  const admin = store[ADMIN];
  return produce(<T>admin.innerStore);
}

function observe<T>(fc: T) {
  if (typeof fc === "function") {
    // @ts-ignore
    if (fc[OBSERVED]) {
      return fc;
    }

    // class component
    if (typeof fc.prototype?.render === "function") {
      const observed = observe((props: any) => {
        Object.keys(props).forEach((key) => observe(props[key]));
        return createElement(fc as any, props);
      }) as FunctionComponent;
      return observed;
    }

    // observe fc
    const observed = ((...args: any[]) => {
      const storeRef = useRef<StoreRef>();
      const [, forceUpdate] = useReducer((x) => x + 1, 0);

      if (!storeRef.current) {
        const onDepend: ReportDepend = (prop, options) => {
          const subscribers = options?.isDeep
            ? prop.deepSubscribers
            : prop.subscribers;
          subscribers.add(forceUpdate);
          storeRef.current.unsubscribeList.push(() =>
            subscribers.delete(forceUpdate)
          );
        };

        const unsubscribe = () =>
          storeRef.current.unsubscribeList.splice(0).forEach((fn) => fn());

        storeRef.current = {
          onDepend,
          unsubscribe,
          unsubscribeList: [],
        };
      }

      // 每次render清理，重新收集依赖
      storeRef.current.unsubscribe();
      reportDepend = storeRef.current.onDepend;
      const result = fc(...args);
      reportDepend = undefined;

      useEffect(() => {
        return () => {
          // unmount清理
          storeRef.current?.unsubscribe();
          storeRef.current = undefined;
        };
      }, []);

      return result;
    }) as T;
    // @ts-ignore
    observed[OBSERVED] = true;
    return observed;
  }

  if (typeof fc === "object") {
    // observe memoed fc
    // @ts-ignore
    if (fc.$$typeof && typeof fc.type === "function") {
      // @ts-ignore
      fc.type = observe(fc.type);
      return fc;
    }

    // observe store prop
    if (reportDepend) {
      const admin = (fc as unknown as Store)[ADMIN];
      const state = (fc as unknown as Store)[STATE];
      /* istanbul ignore else */
      if (admin && state) {
        const prop = getStoreProp(admin.storeName, state.name);
        reportDepend(prop, { isDeep: true });
        return fc;
      }
    }
  }

  // others just return
  return fc;
}

function observeAndMemo<T extends object, K extends FC<T>>(fc: K) {
  return memo<T>(observe(fc));
}

function connect<T, K extends T>(
  mapProps: () => T,
  ClassComponent: ComponentClass<K> | NamedExoticComponent<K>
) {
  return observe((props: K) =>
    createElement(ClassComponent, { ...mapProps(), ...props })
  ) as FunctionComponent<Omit<K, keyof T>>;
}

export {
  Store,
  createStore,
  resetStore,
  subscribeStore,
  observe,
  observeAndMemo,
  configStore,
  logger,
  innerProduce,
  connect,
};
