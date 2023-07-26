export function clone<T>(obj: T) {
  if (Array.isArray(obj)) {
    return [...obj];
  }
  // support prototype clone
  const cloned = { ...obj };
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype) {
    Object.setPrototypeOf(cloned, proto);
  }
  return cloned;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getDescriptor(target: any, prop: string) {
  let that = target;
  while (that && that !== Object.prototype) {
    const config = Object.getOwnPropertyDescriptor(that, prop);
    if (config) {
      return config;
    }
    that = Object.getPrototypeOf(that);
  }
  return null;
}

export function replaceWithKeys(name: string) {
  const arr = name.split(".");
  arr[arr.length - 1] = "keys()";
  return arr.join(".");
}

export function arrayPatch<T extends object>(handle: ProxyHandler<T>) {
  const arrayHandle: ProxyHandler<T> = {};
  Object.keys(handle).forEach((key) => {
    // @ts-ignore
    arrayHandle[key] = (stateArr, ...args) => handle[key](stateArr[0], ...args);
  });
  return arrayHandle;
}

export function isSpecialReactElement(val: any) {
  return val && typeof val === "object" && !!val.$$typeof;
}
