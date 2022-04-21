export function clone<T>(obj: T) {
  if (Array.isArray(obj)) {
    return [...obj];
  }
  return { ...obj };
}

const asyncReg = /^function[^{]*?{\s*return\s+[^(,;\s]+\(/;
export function isAsyncAction(func: Function) {
  if (func.constructor && func.constructor.name === "AsyncFunction") {
    return true;
  }

  const funcStr = func.toString();

  if (funcStr.indexOf("regenerator") !== -1) {
    return true;
  }

  if (asyncReg.test(funcStr)) {
    return true;
  }

  return false;
}
