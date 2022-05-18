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
