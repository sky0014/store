import {
  ComponentClass,
  FC,
  FunctionComponent,
  NamedExoticComponent,
  createElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createLogger } from "@sky0014/logger";
import {
  ParametersExceptFirst,
  arrayPatch,
  clone,
  getDescriptor,
  getFunctions,
  replaceWithKeys,
} from "./util";
import unstable_batchedUpdates from "unstable_batchedupdates";

const LIB_NAME = "store";
const STATE = Symbol("state");
const ADMIN = Symbol("admin");
const INNER = Symbol("inner");
const OBSERVED = Symbol("observed");
const UNSET = Symbol("unset");

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
  isKeys?: boolean;
  subscribeComputers: Set<Prop>;
  subscribers: Set<Subscriber>;
  deepSubscribers: Set<Subscriber>;
  keysProp?: Prop;
  computed?: Computed;
}

interface Computed {
  changed: boolean;
  getter: () => any;
  value: any;
  unsubscribers: Set<Unsubscriber>;
}

interface State {
  name: string;
  storeName: string;
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
  subscribeListeners: Set<SubscribeListener>;
  innerStore: Store;
}

interface StoreRef {
  onDepend: ReportDepend;
  unsubscribe: Unsubscriber;
  unsubscribeList: Unsubscriber[];
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
// 所有创建的store
let stores: Record<string, Store & Record<string, any>> = {};
// 所有被监听的props，以store分割，以提高效率 { storeName: { propName: Prop } ... }
// 特例：.keys()
let storeProps: Record<string, Record<string, Prop>> = {};
let computedTarget: Prop[] = [];
let reportDepend: ReportDepend;
let batchedUpdateList: Set<Subscriber> = new Set();
let batchedUpdateScheduled = false;
let pendingChanged: Map<
  Prop,
  { prop: Prop; state: State; admin: StoreAdmin; propName: string }
> = new Map();
let pendingChangedComputed: Map<Prop, any> = new Map();
let pendingComputedObserved: Map<Prop, Set<Prop>> = new Map();

/* istanbul ignore next */
function resetStore() {
  stores = {};
  storeProps = {};
  computedTarget = [];
  reportDepend = undefined;
  batchedUpdateList = new Set();
  batchedUpdateScheduled = false;
  pendingChanged = new Map();
  pendingChangedComputed = new Map();
  pendingComputedObserved = new Map();
}

function getStoreProp(
  storeName: string,
  name: string,
  isKeys = false,
  init: (prop: Prop) => void = null
) {
  let props = storeProps[storeName];
  let prop: Prop;

  if (isKeys) {
    name += ".keys()";
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        name,
        isKeys: true,
        subscribeComputers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
    }
  } else {
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        name,
        subscribeComputers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
      init && init(prop);
    }
  }

  return prop;
}

function getPropValue(propName: string) {
  const arr = propName.split(".");
  const len = arr.length;

  let v: any = stores[arr[0]];
  for (let i = 1; i < len; i++) {
    v = v[arr[i]];
  }

  return v;
}

function getComputedThis(computedProp: Prop) {
  const { name } = computedProp;
  const arr = name.split(".");
  return getPropValue(arr.slice(0, arr.length - 1).join("."));
}

function getComputedValue(computedProp: Prop) {
  const { computed } = computedProp;

  if (computed.changed) {
    // 上级已被删除时，返回旧值兼容处理
    const that = getComputedThis(computedProp);
    if (!that) {
      return computed.value;
    }

    // 如改变，则重新收集依赖
    computed.unsubscribers.forEach((fn) => fn());
    computed.unsubscribers.clear();

    try {
      computedTarget.push(computedProp);

      const newValue = computed.getter.apply(that); // maybe exception

      if (computed.value !== UNSET && newValue !== computed.value) {
        if (pendingChangedComputed.has(computedProp)) {
          // 如恢复原始值，从map中删除
          const originalValue = pendingChangedComputed.get(computedProp);
          if (originalValue === newValue) {
            pendingChangedComputed.delete(computedProp);
          }
        } else {
          // 存储原始值
          pendingChangedComputed.set(computedProp, computed.value);
        }
      }

      computed.value = newValue;

      // if computed return store, observe it
      if (typeof computed.value === "object") {
        const state: State = computed.value[STATE];
        if (state) {
          const prop = getStoreProp(state.storeName, state.name);
          /* istanbul ignore else */
          if (!pendingComputedObserved.has(computedProp)) {
            pendingComputedObserved.set(computedProp, new Set());
          }
          pendingComputedObserved.get(computedProp).add(prop);
        }
      }
    } finally {
      computed.changed = false;
      computedTarget.pop();
    }
  }

  return computed.value;
}

function computedChanged(computedProp: Prop) {
  computedProp.computed.changed = true;

  if (computedProp.subscribeComputers?.size) {
    computedProp.subscribeComputers.forEach(computedChanged);
  }
}

function isStateChanged(state: State, propName: string) {
  return (
    state.base &&
    state.copy &&
    typeof state.base === "object" &&
    state.base[propName] !== state.copy[propName]
  );
}

function isStateKeysChanged(state: State, propName: string) {
  return (
    state.base &&
    state.copy &&
    typeof state.base === "object" &&
    propName in state.base !== propName in state.copy
  );
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
    subscribeListeners: new Set(),
    innerStore: null,
  };

  const getProp = (...args: ParametersExceptFirst<typeof getStoreProp>) =>
    getStoreProp(storeName, ...args);

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
      const target = computedTarget[computedTarget.length - 1];
      prop.subscribeComputers.add(target);
      target.computed.unsubscribers.add(() => {
        prop.subscribeComputers.delete(target);
      });
    }

    if (reportDepend) {
      reportDepend(prop, { isDeep });
    }
  };

  const createProxy = (
    target: any,
    name: string,
    parent: State,
    storeName: string
  ) => {
    logger.log(`create proxy: ${name}`);

    const state: State = {
      name,
      storeName,
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

    const source = latest(state);
    const computed = getProp(name, false, initComputed(source, prop)).computed;
    if (computed) {
      die(`You should not set or delete computed props(${name})!`);
    }

    if (
      isDelete
        ? prop in source
        : source[prop] !== value || (prop === "length" && Array.isArray(source)) // array.length特例：array修改时，length会自动变化，需要监听
    ) {
      // changed
      logger.log(`${name} changed`);

      const sProp = getProp(name);

      // handle state
      if (!state.copy) {
        state.copy = clone(state.base);
      }
      isDelete ? delete state.copy[prop] : (state.copy[prop] = value);
      pendingChanged.set(sProp, {
        prop: sProp,
        state,
        admin,
        propName: prop,
      });

      // handle computed
      // computed should be updated immediately because it's value maybe used immediately
      // prop self
      sProp.subscribeComputers.forEach(computedChanged);
      // prop keys
      if (isStateKeysChanged(state, prop)) {
        // 此处调用getKeysProp以建立keys <--> prop的连接
        const keysProp = getKeysProp(name);
        keysProp?.subscribeComputers.forEach(computedChanged);
      }

      // 改变后触发finalize, finalize内部会做延迟合并处理
      finalize();
    }

    return true;
  };

  const initComputed = (source: any, propName: string) => (prop: Prop) => {
    const desc = getDescriptor(source, propName);

    if (desc?.get) {
      // handle computed
      prop.computed = {
        changed: true,
        getter: desc.get,
        value: UNSET,
        unsubscribers: new Set(),
      };
    }

    if (desc?.set) {
      die(`Do not allow setter(${prop.name}) in Store!`);
    }
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
          return state.base?.toJSON;
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
        const sProp = getProp(name, false, initComputed(source, prop));

        let value: any;

        if (sProp.computed) {
          value = getComputedValue(sProp);
        } else {
          value = source[prop];
        }

        if (typeof value !== "function") {
          // action不用subscribe
          reportSubscribe(name);
        }

        if (!value || typeof value !== "object" || sProp.computed) {
          return value;
        }

        const isInner = receiver[INNER];
        const valueState: State = value[STATE];

        if (!valueState) {
          value = source[prop] = createProxy(value, name, state, storeName);
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
        return Object.getPrototypeOf(latest(state));
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
    storeName,
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
    // handle actions
    if (typeof desc.value === "function") {
      const func = desc.value.bind(innerStore);
      // @ts-ignore
      target[key] = (...args: any[]) => {
        logger.log(`call action: ${storeName}.${key}`, ...args);
        return func(...args);
      };
    }
  });

  // save innerStore
  admin.innerStore = innerStore as any as Store;

  const store = outerStore as any as T & Store;

  // save stores
  stores[storeName] = store;

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

function handleStateChain(state: State, changedList: Set<Prop>) {
  state.expired = true;

  if (state.copy) {
    state.base = state.copy;
    delete state.copy;
  }

  const prop = getStoreProp(state.storeName, state.name);
  if (prop.deepSubscribers?.size) {
    prop.deepSubscribers.forEach((sub) => batchedUpdateList.add(sub));
  }
  changedList.add(prop);

  if (state.parent) {
    handleStateChain(state.parent, changedList);
  }
}

function handleDirectChanged(prop: Prop) {
  if (prop.subscribers.size) {
    let changed = true;

    // 当外部组件依赖computed时，需要对computed进行即时计算，以识别值是否改变，是否需要刷新组件
    if (prop.computed) {
      if (prop.computed.changed) {
        getComputedValue(prop);
        changed = pendingChangedComputed.has(prop);
      } else {
        changed = false;
      }
    }

    if (changed) {
      prop.subscribers.forEach((sub) => batchedUpdateList.add(sub));
    }
  }

  // maybe trigger computed
  if (prop.subscribeComputers.size) {
    prop.subscribeComputers.forEach(handleDirectChanged);
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

      const changedDirectStates = new Map<Prop, State>();
      const changedAllProps = new Set<Prop>();
      const changedStoreNames = new Set<string>();
      const adminSubscribes = new Map<StoreAdmin, Set<string>>();

      pendingChanged.forEach(({ prop, state, admin, propName }) => {
        if (isStateChanged(state, propName)) {
          // changed
          changedStoreNames.add(state.storeName);
          changedDirectStates.set(prop, state);
          changedAllProps.add(prop);

          if (prop.keysProp && isStateKeysChanged(state, propName)) {
            changedDirectStates.set(prop.keysProp, null);
            changedAllProps.add(prop.keysProp);
          }

          if (admin.subscribeListeners.size) {
            if (!adminSubscribes.has(admin)) {
              adminSubscribes.set(admin, new Set());
            }
            adminSubscribes.get(admin).add(prop.name);
          }
        }
      });
      pendingChanged.clear();

      if (!changedDirectStates.size) {
        pendingComputedObserved.clear();
        pendingChangedComputed.clear();
        return;
      }

      logger.log("finalize...", ...changedStoreNames);

      // 首先将所有prop state成功设置，后续计算computed时将可以获得最新值
      // 同时将所有改变的props收集（包括直接和间接），便于后续computed计算使用
      changedDirectStates.forEach(
        (state) => state && handleStateChain(state, changedAllProps)
      );

      // 如果computed直接返回store prop，会将其记录到该map中
      // 在finalize时，该prop值可能改变，此时需要将该computed及其被依赖的所有computed都设置为changed=true，以便于后续重新计算获取最新值
      pendingComputedObserved.forEach((props, computedProp) => {
        for (let prop of props) {
          if (changedAllProps.has(prop)) {
            computedChanged(computedProp);
            return;
          }
        }
      });

      // 收集batchedUpdateList
      // 包括prop和computed触发
      // 如果由prop触发，直接加入batchedUpdateList
      // 如果由computed触发，会计算该computed，将值与之前的值进行对比，不相等时才加入batchedUpdateList
      changedDirectStates.forEach((_, prop) => {
        handleDirectChanged(prop);
      });
      // 清空pending项
      pendingComputedObserved.clear();
      pendingChangedComputed.clear();

      if (adminSubscribes.size) {
        adminSubscribes.forEach((names, admin) =>
          admin.subscribeListeners.forEach((listener) => listener(names))
        );
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
      const [, setState] = useState({});
      const forceUpdate = useCallback(() => setState({}), []);

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
      const state = (fc as unknown as Store)[STATE];
      /* istanbul ignore else */
      if (state) {
        const prop = getStoreProp(state.storeName, state.name);
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
