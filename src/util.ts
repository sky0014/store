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

// get all functions include prototype chain
export function getFunctions(target: Record<string, any>) {
  let that = target;
  let map: Record<string, PropertyDescriptor> = {};
  while (that && that !== Object.prototype) {
    Object.getOwnPropertyNames(that).forEach((name) => {
      if (name === "constructor") {
        return;
      }

      const config = Object.getOwnPropertyDescriptor(that, name);
      /* istanbul ignore else */
      if (config) {
        // 先找到的为准，后找到的忽略
        if (!map[name]) {
          map[name] = config;
        }
      }
    });
    that = Object.getPrototypeOf(that);
  }
  return map;
}
