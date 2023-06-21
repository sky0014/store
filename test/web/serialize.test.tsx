import { parse, register, stringify } from "../../src/serialize";

describe("serialize", () => {
  class A {
    _a = 1;

    get a() {
      return this._a;
    }

    set a(val: number) {
      this._a = val;
    }
  }

  class B {
    b = new A();
  }

  class C {
    c = {
      a: new A(),
      b: new B(),
      c: 2,
    };
  }

  register({
    A,
    B,
    C,
  });

  it("serial and parse", () => {
    const str = stringify(new A());
    expect(JSON.parse(str)).toEqual({
      "__@@serial_cls": {
        "__@@serial_type": "A",
        "__@@serial_data": { _a: 1 },
      },
    });

    const parsed = parse(str);
    expect(parsed instanceof A).toBe(true);
    expect(parsed.a).toBe(1);
  });

  it("serial nested data", () => {
    const nest = {
      a: new A(),
      b: new B(),
      c: new C(),
    };

    const str = stringify(nest);
    const parsed = parse(str);
    expect(parsed).toEqual(nest);
    expect(parsed.a instanceof A).toBe(true);
    expect(parsed.b instanceof B).toBe(true);
    expect(parsed.c instanceof C).toBe(true);
    expect(parsed.c.c.a instanceof A).toBe(true);
    expect(parsed.c.c.c).toBe(2);
  });

  it("register duplicated key", () => {
    expect(() => register({ A: class {} })).toThrow(
      "already registed serial key: A"
    );
  });
});
