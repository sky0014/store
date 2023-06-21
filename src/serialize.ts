type Cls = Function;
type ClsMap = Record<string, Cls>;

const CLS_KEY = "__@@serial_cls";
const TYPE_KEY = "__@@serial_type";
const DATA_KEY = "__@@serial_data";

const serialMap: ClsMap = {};

export function register(types: ClsMap) {
  Object.keys(types).forEach((type) => {
    if (serialMap[type]) {
      throw new Error(`already registed serial key: ${type}`);
    }

    const cls = types[type];
    cls.prototype.toJSON = function () {
      return {
        [CLS_KEY]: {
          [TYPE_KEY]: type,
          [DATA_KEY]: { ...this },
        },
      };
    };

    serialMap[type] = cls;
  });
}

export function stringify(obj: any) {
  return JSON.stringify(obj);
}

export function parse(str: string) {
  return JSON.parse(str, function (key, value) {
    if (key === CLS_KEY) {
      const { [TYPE_KEY]: type, [DATA_KEY]: data } = value;
      Object.setPrototypeOf(data, serialMap[type].prototype);
      return data;
    }

    if (value[CLS_KEY]) {
      return value[CLS_KEY];
    }

    return value;
  });
}
