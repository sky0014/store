import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createLogger } from "@sky0014/logger";
import {
  arrayPatch,
  clone,
  getDescriptor,
  isSpecialReactElement,
  replaceWithKeys,
} from "./util";
import unstable_batchedUpdates from "unstable_batchedupdates";
import { applyPatch, createPatch } from "../third_party/symmetry/src";

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
  autoMemo?: boolean;
  autoMerge?: boolean;
}

interface CreateStoreOptions {
  storeName?: string;
}

interface Prop {
  name: string;
  storeName: string;
  propName?: string;
  parentState?: State;
  isKeys?: boolean;
  keysProp?: Prop;
  computed?: Computed;
  admin?: StoreAdmin;
  subscribeComputers: Set<Prop>;
  deepSubscribeComputers: Set<Prop>;
  subscribers: Set<Subscriber>;
  deepSubscribers: Set<Subscriber>;
}

interface Computed {
  changed: boolean;
  getter: () => any;
  value: any;
  unsubscribers: Set<Unsubscriber>;
  depends: Set<string>;
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
  depends: Set<string>;
  onDepend: ReportDepend;
  unsubscribe: Unsubscriber;
  unsubscribeList: Unsubscriber[];
}

interface StoreSave {
  store: Store & Record<string, any>;
  snapshot: Record<string, any>;
}

let storeOptions: ConfigStoreOptions = {
  debug: false,
  autoMemo: false,
  autoMerge: false,
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
let stores: Record<string, StoreSave>;
// 所有被监听的props，以store分割，以提高效率 { storeName: { propName: Prop } ... }
// 特例：.keys()
let storeProps: Record<string, Record<string, Prop>>;
let computedTarget: Prop;
let reportDepend: ReportDepend;
let batchedUpdateList: Set<Subscriber>;
let batchedUpdateScheduled = false;
let pendingChanged: Set<Prop>;
let pendingChangedComputed: Map<Prop, any>;

function resetStore() {
  stores = {};
  storeProps = {};
  computedTarget = undefined;
  reportDepend = undefined;
  batchedUpdateList = new Set();
  batchedUpdateScheduled = false;
  pendingChanged = new Set();
  pendingChangedComputed = new Map();
}

resetStore();

function getProp(
  data: Pick<
    Prop,
    "name" | "storeName" | "propName" | "parentState" | "isKeys" | "admin"
  >,
  init: (prop: Prop) => void = null
) {
  let { name, storeName, isKeys = false } = data;
  let props = storeProps[storeName];
  let prop: Prop;

  if (isKeys) {
    name += ".keys()";
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        ...data,
        subscribeComputers: new Set(),
        deepSubscribeComputers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
    }
  } else {
    prop = props[name];

    if (!prop) {
      prop = props[name] = {
        ...data,
        subscribeComputers: new Set(),
        deepSubscribeComputers: new Set(),
        subscribers: new Set(),
        deepSubscribers: new Set(),
      };
      init && init(prop);
    }
  }

  if (data.parentState) {
    // update parentState
    prop.parentState = data.parentState;
  }

  return prop;
}

function _internalGetTargetValue(
  propName: string,
  getTarget: (save: StoreSave) => any
) {
  const arr = propName.split(".");
  const len = arr.length;

  let v = getTarget(stores[arr[0]]);
  for (let i = 1; i < len; i++) {
    v = v[arr[i]];
  }

  return v;
}

function getPropValue(propName: string) {
  return _internalGetTargetValue(propName, (save) => save.store);
}

function getSnapshotValue(propName: string) {
  return _internalGetTargetValue(propName, (save) => save.snapshot);
}

function getComputedThis(computedProp: Prop) {
  const { name } = computedProp;
  const arr = name.split(".");
  return getPropValue(arr.slice(0, arr.length - 1).join("."));
}

function getComputedValue(computedProp: Prop) {
  const { computed } = computedProp;

  if (computed.changed) {
    // 兼容处理：上级已被删除时，返回旧值
    const that = getComputedThis(computedProp);
    /* istanbul ignore next */
    if (!that) {
      return computed.value;
    }

    // 如改变，则重新收集依赖
    computed.unsubscribers.forEach((fn) => fn());
    computed.unsubscribers.clear();
    computed.depends.clear();

    const lastComputedTarget = computedTarget;
    try {
      computedTarget = computedProp;

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

      // if computed value contains store prop, observe it with deep
      walkProp(newValue, (prop) =>
        reportSubscribe(prop.storeName, prop.name, { isDeep: true })
      );
    } finally {
      computed.changed = false;
      computedTarget = lastComputedTarget;
    }
  }

  return computed.value;
}

function computedChanged(computedProp: Prop) {
  computedProp.computed.changed = true;
  computedProp.subscribeComputers.forEach(computedChanged);
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

function getPropShowName(prop: Prop, { isDeep }: { isDeep: boolean }) {
  const arr = [prop.name];
  if (prop.isKeys) arr.push("keys()");
  if (isDeep) arr.push("deep()");
  return arr.join(".");
}

function reportSubscribe(
  storeName: string,
  name: string,
  { isKeys = false, isDeep = false } = {}
) {
  const prop = getProp({ storeName, name, isKeys });

  // connect with computed
  if (computedTarget) {
    const target = computedTarget;
    const subscriber = isDeep
      ? prop.deepSubscribeComputers
      : prop.subscribeComputers;
    subscriber.add(target);
    target.computed.unsubscribers.add(() => {
      subscriber.delete(target);
    });
    target.computed.depends.add(getPropShowName(prop, { isDeep }));
    return;
  }

  // connect with component
  if (reportDepend) {
    reportDepend(prop, { isDeep });
  }
}

function walkProp(value: any, handle: (prop: Prop) => void) {
  if (!value || typeof value !== "object") {
    return;
  }

  /* istanbul ignore next */
  if (isSpecialReactElement(value)) {
    return;
  }

  const state: State = value[STATE];
  if (state) {
    const prop = getProp({ storeName: state.storeName, name: state.name });
    prop && handle(prop);
  } else {
    Object.keys(value).forEach((key) => {
      const subProp = value[key];
      walkProp(subProp, handle);
    });
  }
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

  // 关联prop <--> keys
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

  const markComputedChanged = (prop: Prop, isCurrent = true) => {
    if (isCurrent) {
      prop.subscribeComputers.forEach(computedChanged);
    }

    const { parentState } = prop;
    if (parentState) {
      const parentProp = getProp({
        storeName: parentState.storeName,
        name: parentState.name,
      });
      parentProp.deepSubscribeComputers.forEach(computedChanged);
      markComputedChanged(parentProp, false);
    }
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
    const sProp = getProp(
      { storeName, name, parentState: state, propName: prop, admin },
      initComputed(source, prop)
    );
    const { computed } = sProp;
    if (computed) {
      die(`You should not set or delete computed props(${name})!`);
    }

    const originalValue = source[prop];
    if (
      isDelete
        ? prop in source
        : originalValue !== value ||
          (prop === "length" && Array.isArray(source)) // array.length特例：array修改时，length会自动变化，需要监听
    ) {
      if (
        storeOptions.autoMerge &&
        !isDelete &&
        value &&
        typeof value === "object" &&
        originalValue &&
        typeof originalValue === "object"
      ) {
        const patch = createPatch(originalValue, value);
        // reset：完全改变，此时按原方式处理
        if (patch !== "reset") {
          // 没有改变
          if (patch === "none") {
            return true;
          }
          // 部分改变
          applyPatch.inPlace(originalValue[STATE].inner, patch);
          return true;
        }
      }

      // changed
      logger.log(`${name} changed`);

      // state self
      if (!state.copy) {
        state.copy = clone(state.base);
      }
      isDelete ? delete state.copy[prop] : (state.copy[prop] = value);
      pendingChanged.add(sProp);

      // handle computed
      // computed should be updated immediately because it's value maybe used immediately
      // prop self
      markComputedChanged(sProp);
      // prop keys
      if (isStateKeysChanged(state, prop)) {
        // 此处调用getKeysProp以建立keys <--> prop的连接
        const keysProp = getKeysProp(name);
        keysProp && markComputedChanged(keysProp);
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
        depends: new Set(),
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

        if (prop === "constructor") {
          return source[prop];
        }

        const name = `${state.name}.${prop}`;
        const sProp = getProp(
          { storeName, name, parentState: state, propName: prop, admin },
          initComputed(source, prop)
        );

        let value: any;

        if (sProp.computed) {
          value = getComputedValue(sProp);
        } else {
          value = source[prop];
        }

        // dynamic generate actions
        if (typeof value === "function") {
          // 排除Array和Object的原型方法
          if (
            // @ts-ignore
            Array.prototype[prop] === value ||
            // @ts-ignore
            Object.prototype[prop] === value
          ) {
            return value;
          }

          if (!source.hasOwnProperty(prop)) {
            // make action
            const action = (...args: any[]) => {
              logger.log(`call action: ${name}`, ...args);
              const that = getPropValue(state.name);
              return value.apply(that[STATE].inner, args);
            };
            source[prop] = action;
          }
          return source[prop];
        }

        reportSubscribe(storeName, name);

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
        // create keys prop
        getProp({
          storeName,
          name: state.name,
          parentState: state,
          propName: "keys()",
          isKeys: true,
          admin,
        });
        reportSubscribe(storeName, state.name, { isKeys: true });
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

  state.inner = innerStore;
  state.outer = outerStore;

  // check symbol
  const symbols = Object.getOwnPropertySymbols(target);
  if (symbols.length) {
    logger.warn("checked symbol in store:", symbols);
    die("Symbol in store not supported!");
  }

  // save innerStore
  admin.innerStore = innerStore as any as Store;

  const store = outerStore as any as T & Store;

  // save stores
  stores[storeName] = {
    store,
    snapshot: getSnapshot(store, true),
  };

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

function handleStateChain(state: State) {
  state.expired = true;

  if (state.copy) {
    state.base = state.copy;
    delete state.copy;
  }

  // deep subscribe 处理
  const prop = getProp({ storeName: state.storeName, name: state.name });
  prop.deepSubscribers.forEach((sub) => batchedUpdateList.add(sub));
  // slice prop.deepSubscribeComputers以避免无限循环
  [...prop.deepSubscribeComputers].forEach((computedProp) => {
    // 标记为改变
    computedChanged(computedProp);
    // 收集computed的subscribers
    handleDirectChanged(computedProp);
  });

  // 遍历 parent
  if (state.parent) {
    handleStateChain(state.parent);
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

function handleSnapshot(prop: Prop) {
  if (prop.isKeys) {
    return;
  }

  const arr = prop.name.split(".");
  const lastIndex = arr.length - 1;
  const storeName = arr[0];
  const propName = arr[lastIndex];

  // 从外往内
  // root引用变更
  let val = getSnapshotValue(storeName);
  stores[storeName].snapshot = val = clone(val);
  // 中间对象变更
  for (let i = 1; i < lastIndex; i++) {
    const name = arr[i];
    const newVal = clone(val[name]);
    val[name] = newVal;
    val = newVal;
  }
  // 最终直接修改的prop变更
  val[propName] = getSnapshot(getPropValue(prop.name), true);
}

function finalize() {
  // 延迟更新，可以合并多个同步的action，减少不必要渲染
  if (!batchedUpdateScheduled) {
    batchedUpdateScheduled = true;

    Promise.resolve().then(() => {
      batchedUpdateScheduled = false;

      /* istanbul ignore next */
      if (!pendingChanged.size) return;

      const changedProps = new Set<Prop>();
      const changedStoreNames = new Set<string>();
      const adminSubscribes = new Map<StoreAdmin, Set<string>>();

      pendingChanged.forEach((prop) => {
        const { parentState: state, propName, admin } = prop;

        if (isStateChanged(state, propName)) {
          // changed
          changedStoreNames.add(state.storeName);
          changedProps.add(prop);

          if (prop.keysProp && isStateKeysChanged(state, propName)) {
            changedProps.add(prop.keysProp);
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

      if (!changedProps.size) {
        // 清空pending项
        pendingChangedComputed.clear();
        return;
      }

      logger.log("finalize...", ...changedStoreNames);

      // 首先将所有prop state成功设置，后续计算computed时将可以获得最新值
      // 同时将所有改变的props收集（包括直接和间接），便于后续computed计算使用
      changedProps.forEach(
        ({ parentState: state }) => state && handleStateChain(state)
      );

      // 收集batchedUpdateList
      // 包括prop和computed触发
      // 如果由prop触发，直接加入batchedUpdateList
      // 如果由computed触发，会计算该computed，将值与之前的值进行对比，不相等时才加入batchedUpdateList
      changedProps.forEach(handleDirectChanged);

      // change snapshot
      changedProps.forEach(handleSnapshot);

      // 通知监听函数
      if (adminSubscribes.size) {
        try {
          adminSubscribes.forEach((names, admin) =>
            admin.subscribeListeners.forEach((listener) => listener(names))
          );
        } catch (e) {
          /* istanbul ignore next */
          logger.warn(`run store subscribe listener error: ${e}`);
        }
      }

      // 清空pending项
      pendingChangedComputed.clear();

      // 批量执行update
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

function getSnapshot<T>(store: T, clean = false): T {
  // @ts-ignore
  if (!store || typeof store !== "object" || isSpecialReactElement(store)) {
    return store;
  }

  // @ts-ignore
  const state = store[STATE];
  if (!state) {
    // 非store，遍历下一层
    if (Array.isArray(store)) {
      return store.map((v) => getSnapshot(v, clean)) as T;
    }

    const obj: Record<string, any> = {};
    Object.keys(store).forEach((k) => {
      // @ts-ignore
      obj[k] = getSnapshot(store[k], clean);
    });
    const proto = Object.getPrototypeOf(store);
    if (proto !== Object.prototype) {
      Object.setPrototypeOf(obj, proto);
    }
    return obj as T;
  }

  if (clean) {
    return getSnapshot(latest(state));
  }

  return getSnapshotValue(state.name);
}

function observe<T>(
  fc: T,
  { full = false, memo: _memo = storeOptions.autoMemo } = {}
): T {
  // @ts-ignore
  if (!fc || fc[OBSERVED]) {
    return fc;
  }

  const setDisplayName = (observed: any) => {
    // @ts-ignore
    const displayName = fc.displayName || fc.name;
    if (displayName) {
      observed.displayName = `observed(${displayName})`;
    }
  };

  const isClassComponent =
    typeof fc === "function" && typeof fc.prototype?.render === "function";

  // class or function component
  if (typeof fc === "function") {
    // class component
    if (full || isClassComponent) {
      // full observe
      const observed = observe(
        (props: any, ref: any) => {
          // class component ref in props
          if (isClassComponent) {
            const { children, ref, key, ...rest } = props;
            // full observe props
            Object.keys(rest).forEach((key) => observe(rest[key]));
            return createElement(fc as any, {
              ...getSnapshot(rest),
              children,
              ref,
              key,
            });
          }
          // function component ref in params
          const { children, ...rest } = props;
          // full observe props
          Object.keys(rest).forEach((key) => observe(rest[key]));
          return fc({ ...getSnapshot(rest), children }, ref);
        },
        { memo: _memo }
      );
      setDisplayName(observed);
      return observed as T;
    }

    // function component
    let observed = ((...args: any[]) => {
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
          storeRef.current.depends.add(
            getPropShowName(prop, { isDeep: options?.isDeep })
          );
        };

        const unsubscribe = () => {
          storeRef.current.depends.clear();
          storeRef.current.unsubscribeList.splice(0).forEach((fn) => fn());
        };

        storeRef.current = {
          depends: new Set(),
          onDepend,
          unsubscribe,
          unsubscribeList: [],
        };
      }

      // 每次render清理，重新收集依赖
      const lastReportDepend = reportDepend;
      storeRef.current.unsubscribe();
      reportDepend = storeRef.current.onDepend;
      const result = fc(...args);
      reportDepend = lastReportDepend;

      useEffect(() => {
        return () => {
          // unmount清理
          storeRef.current?.unsubscribe();
          storeRef.current = undefined;
        };
      }, []);

      return result;
    }) as T;

    if (_memo) {
      // @ts-ignore
      observed = memo(observed);
    }

    setDisplayName(observed);

    // @ts-ignore
    observed[OBSERVED] = true;

    return observed;
  }

  // special component: memo/forwardRef/lazy ...
  if (isSpecialReactElement(fc)) {
    let obj = fc as any;
    if (obj.type) {
      // memo
      obj.type = observe(obj.type, { full, memo: false });
      obj.displayName = obj.type.displayName;
    }
    if (obj.render) {
      // forwardRef
      // render should be function, so do not use memo.
      obj.render = observe(obj.render, { full, memo: false });
      const { displayName } = obj.render;
      if (_memo) {
        obj = memo(obj);
      }
      obj.displayName = displayName;
    }
    if (obj._payload?._result) {
      // lazy
      // @ts-ignore
      const original = obj._payload._result;
      obj._payload._result = () => {
        // @ts-ignore
        return original().then((result) => {
          /* istanbul ignore else */
          if (result.default) {
            result.default = observe(result.default, { full, memo: _memo });
          }
          return result;
        });
      };
    }
    obj[OBSERVED] = true;
    return obj;
  }

  // store prop
  if (typeof fc === "object") {
    if (reportDepend) {
      walkProp(fc, (prop) => reportDepend(prop, { isDeep: true }));
    }
  }

  // others just return
  return fc;
}

export {
  Store,
  createStore,
  resetStore,
  subscribeStore,
  observe,
  configStore,
  logger,
  innerProduce,
};
