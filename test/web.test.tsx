import React, { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import logSpy from "./logmock"; // 必须在src之前导入
import { configStore, createStore } from "../src";
import { delay } from "../src/util";

const delayMs = 100;

describe("web store", () => {
  describe("plain prop", () => {
    class Count {
      count = 0;

      add() {
        this.count++;
      }

      async add2() {
        await delay(200);
        this.count++;
      }

      async add3() {
        await delay(200);
        this.add();
      }

      async add4() {
        await this.add2();
        this.add();
      }

      add5() {
        return 5;
      }

      async add6() {
        await delay(200);
        return 6;
      }
    }

    const [count, useCount] = createStore(new Count());

    function Component() {
      const count = useCount();
      return (
        <div>
          <div data-testid="count">{count.count}</div>
          <button data-testid="btn" onClick={count.add}>
            add
          </button>
        </div>
      );
    }

    beforeEach(() => {
      render(<Component />);
    });

    it("get store value", () => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });

    it("sync action", async () => {
      await act(async () => {
        count.add();
        await delay(delayMs); // re-render will delay
      });
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    it("async action", async () => {
      await act(async () => {
        await count.add2();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    });

    it("async action: call other sync action", async () => {
      await act(async () => {
        await count.add3();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("3");
    });

    it("async action: call other async action", async () => {
      await act(async () => {
        await count.add4();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("5");
    });

    it("call action in component", async () => {
      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("6");
    });

    it("sync action return value", () => {
      expect(count.add5()).toBe(5);
    });

    it("async action return value", () => {
      return count.add6().then((val) => expect(val).toBe(6));
    });
  });

  describe("nested prop", () => {
    class Count {
      nest = {
        a: {
          count: 0,
        },
        b: {
          c: 99,
        },
        arr: [1, 2, 3],
      };

      add() {
        this.nest.a.count++;
      }

      async add2() {
        await delay(200);
        this.nest.a.count += 2;
      }

      async add3() {
        await delay(200);
        this.add();
      }

      async add4() {
        await delay(200);
        await this.add2();
      }

      reset() {
        delete this.nest.a;
      }

      setD() {
        // @ts-ignore
        this.nest.d = 100;
      }

      setABC() {
        // @ts-ignore
        this["abc"] = 101;
      }

      pushArr(ele: number) {
        this.nest.arr.push(ele);
      }
    }

    const [count, useCount] = createStore(new Count());

    const funcA = jest.fn();
    const funcB = jest.fn();

    function Component() {
      const count = useCount();

      useEffect(funcA, [count.nest.a]);
      useEffect(funcB, [count.nest.b]);

      return (
        <div>
          <div data-testid="count">{count.nest.a?.count ?? "none"}</div>
          {/* @ts-ignore */}
          <div data-testid="dynamic">{count.nest["d"] ?? "none"}</div>
          {/* @ts-ignore */}
          <div data-testid="dynamic2">{count["abc"] ?? "none"}</div>
          <div data-testid="array">{count.nest.arr.join(",")}</div>
          <button data-testid="btn" onClick={count.add}>
            add
          </button>
        </div>
      );
    }

    beforeEach(() => {
      render(<Component />);
    });

    it("init render", () => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
      expect(funcA).toHaveBeenCalledTimes(1);
      expect(funcB).toHaveBeenCalledTimes(1);
    });

    it("sync action", async () => {
      await act(async () => {
        count.add();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("1");
      expect(funcA).toHaveBeenCalledTimes(3); // beforeEach render +1
      expect(funcB).toHaveBeenCalledTimes(2);
    });

    it("async action", async () => {
      await act(async () => {
        await count.add2();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("3");
      expect(funcA).toHaveBeenCalledTimes(5);
      expect(funcB).toHaveBeenCalledTimes(3);
    });

    it("async action: call other sync action", async () => {
      await act(async () => {
        await count.add3();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("4");
      expect(funcA).toHaveBeenCalledTimes(7);
      expect(funcB).toHaveBeenCalledTimes(4);
    });

    it("async action: call other async action", async () => {
      await act(async () => {
        await count.add4();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("6");
      expect(funcA).toHaveBeenCalledTimes(9);
      expect(funcB).toHaveBeenCalledTimes(5);
    });

    it("call action in component", async () => {
      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("7");
      expect(funcA).toHaveBeenCalledTimes(11);
      expect(funcB).toHaveBeenCalledTimes(6);
    });

    it("delete prop", async () => {
      await act(async () => {
        count.reset();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("none");
      expect(funcA).toHaveBeenCalledTimes(13);
      expect(funcB).toHaveBeenCalledTimes(7);
    });

    it("dynamic add nest prop(not recommend)", async () => {
      expect(screen.getByTestId("dynamic")).toHaveTextContent("none");
      await act(async () => {
        count.setD();
        await delay(delayMs);
      });
      expect(screen.getByTestId("dynamic")).toHaveTextContent("100");
      expect(funcA).toHaveBeenCalledTimes(14);
      expect(funcB).toHaveBeenCalledTimes(8);
    });

    it("dynamic add root prop(not recommend)", async () => {
      expect(screen.getByTestId("dynamic2")).toHaveTextContent("none");
      await act(async () => {
        count.setABC();
        await delay(delayMs);
      });
      expect(screen.getByTestId("dynamic2")).toHaveTextContent("101");
      expect(funcA).toHaveBeenCalledTimes(15);
      expect(funcB).toHaveBeenCalledTimes(9);
    });

    it("change array", async () => {
      expect(screen.getByTestId("array")).toHaveTextContent("1,2,3");
      await act(async () => {
        count.pushArr(4);
        await delay(delayMs);
      });
      expect(screen.getByTestId("array")).toHaveTextContent("1,2,3,4");
      expect(funcA).toHaveBeenCalledTimes(16);
      expect(funcB).toHaveBeenCalledTimes(10);
    });
  });

  describe("error boundary", () => {
    it("should not use symbol props", () => {
      const test = Symbol("test");

      class Count {
        [test] = 0;
      }

      class Count2 extends Count {
        count = 100;
      }

      expect(() => createStore(new Count())).toThrow(
        "Symbol in store not supported!"
      );
      // extend test
      expect(() => createStore(new Count2())).toThrow(
        "Symbol in store not supported!"
      );
    });

    it("should not modify data directly", () => {
      class Count {
        count = 0;
      }

      const [count] = createStore(new Count());

      expect(() => count.count++).toThrow("Do not allowed modify data");
      expect(() => delete count.count).toThrow("Do not allowed modify data");
    });

    it("should not modify data directly in nested prop", () => {
      class Count {
        nest = {
          a: {
            b: 100,
          },
        };
      }

      const [count] = createStore(new Count());

      expect(() => count.nest.a.b++).toThrow("Do not allowed modify data");
      expect(() => delete count.nest.a.b).toThrow("Do not allowed modify data");
    });

    it("should not modify data in getter", () => {
      class Count {
        _count = 0;

        get count() {
          this._count = 99;
          return this._count;
        }

        get count2() {
          delete this._count;
          return 0;
        }
      }

      const [count] = createStore(new Count());

      expect(() => count.count).toThrow("Do not allowed modify data");
      expect(() => count.count2).toThrow("Do not allowed modify data");
    });

    it("should not have setter in Store", () => {
      class Count {
        _count = 0;

        set count(val: number) {
          this._count = val;
        }
      }

      expect(() => createStore(new Count())).toThrow("Do not allow setter");
    });

    it("should not delete or set symbol props", () => {
      const symbol = Symbol("test");
      class Count {
        _count = 0;

        get count() {
          return this._count;
        }

        change1() {
          // @ts-ignore
          delete this[symbol];
        }

        change2() {
          // @ts-ignore
          this[symbol] = 100;
        }
      }

      const [count] = createStore(new Count());

      expect(count.change1).toThrow(
        "You should not set or delete symbol props"
      );

      expect(count.change2).toThrow(
        "You should not set or delete symbol props"
      );
    });

    it("should not delete or set computed props", () => {
      class Count {
        _count = 0;

        get count() {
          return this._count;
        }

        change1() {
          // @ts-ignore
          delete this.count;
        }

        change2() {
          // @ts-ignore
          this.count = 100;
        }
      }

      const [count] = createStore(new Count());

      expect(count.change1).toThrow(
        "You should not set or delete computed props"
      );

      expect(count.change2).toThrow(
        "You should not set or delete computed props"
      );
    });
  });

  describe("batch update", () => {
    const renderFn = jest.fn();

    class Count {
      count = 0;

      nest: Record<string, any> = {};

      add() {
        this.count++;
      }

      sub() {
        this.count--;
      }

      addNestData() {
        this.nest["test"] = 99999;
      }

      removeNestData() {
        delete this.nest["test"];
      }
    }

    const [count, useCount] = createStore(new Count());

    function Component() {
      const count = useCount();
      renderFn();
      return (
        <div>
          <div data-testid="count">{count.count}</div>
          <div data-testid="nest">{count.nest["test"] ?? "none"}</div>
          <button
            data-testid="btn"
            onClick={() => {
              count.add();
              count.add();
              count.add();
            }}
          >
            add
          </button>
        </div>
      );
    }

    beforeEach(() => {
      render(<Component />);
    });

    it("batch multiple sync update", async () => {
      await act(async () => {
        count.add();
        count.add();
        count.add();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("3");
      expect(renderFn).toHaveBeenCalledTimes(2);
    });

    it("batch multiple sync update(click button)", async () => {
      await act(async () => {
        screen.getByTestId("btn").click();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("6");
      expect(renderFn).toHaveBeenCalledTimes(4);
    });

    it("restore prop", async () => {
      await act(async () => {
        count.add();
        count.sub();
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("6");
      expect(renderFn).toHaveBeenCalledTimes(5);
    });

    it("restore prop(delete)", async () => {
      await act(async () => {
        count.addNestData();
        count.removeNestData();
        await delay(delayMs);
      });
      expect(screen.getByTestId("nest")).toHaveTextContent("none");
      expect(renderFn).toHaveBeenCalledTimes(6);
    });
  });

  describe("computed", () => {
    const count = jest.fn((a, b) => a * b);

    class Price {
      price = 1;

      count = 10;

      other = -1;

      get money() {
        if (this.price === 0) {
          return 999;
        }

        return count(this.price, this.count);
      }

      get doubleMoney() {
        return 2 * this.money;
      }

      changePrice(price: number) {
        this.price = price;
      }

      addCount() {
        this.count++;
      }

      changeOther() {
        this.other = Math.random();
      }
    }

    const [price, usePrice] = createStore(new Price());

    const Component = () => {
      const price = usePrice();
      return (
        <div>
          <div data-testid="test">{price.money}</div>
          <div data-testid="test2">{price.doubleMoney}</div>
          <button data-testid="btn" onClick={price.addCount}>
            Add Count
          </button>
          <button data-testid="other" onClick={price.changeOther}>
            Change Other
          </button>
        </div>
      );
    };

    it("support computed", async () => {
      const tester = render(<Component />);

      // init compute
      expect(count).toHaveBeenCalledTimes(1);
      expect(tester.getByTestId("test")).toHaveTextContent("10");

      // change from render element
      await act(async () => {
        fireEvent.click(tester.getByTestId("btn")); // re-render will delay
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(2);
      expect(tester.getByTestId("test")).toHaveTextContent("11");

      // change from outside
      await act(async () => {
        price.changePrice(2);
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(3);
      expect(tester.getByTestId("test")).toHaveTextContent("22");

      // change other, no need to compute
      await act(async () => {
        fireEvent.click(tester.getByTestId("other"));
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(3);
      expect(tester.getByTestId("test")).toHaveTextContent("22");

      // change multiple times, compute only once
      await act(async () => {
        price.changePrice(3);
        price.changePrice(4);
        price.changePrice(5);
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(4);
      expect(tester.getByTestId("test")).toHaveTextContent("55");

      // test condition compute
      await act(async () => {
        price.changePrice(0);
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(4);
      expect(tester.getByTestId("test")).toHaveTextContent("999");
      await act(async () => {
        price.changePrice(6);
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(5);
      expect(tester.getByTestId("test")).toHaveTextContent("66");

      // test nested compute
      await act(async () => {
        price.changePrice(7);
        await delay(delayMs);
      });
      expect(count).toHaveBeenCalledTimes(6);
      expect(tester.getByTestId("test")).toHaveTextContent("77");
      expect(tester.getByTestId("test2")).toHaveTextContent("154");
    });

    it("compute with other store", async () => {
      class Store1 {
        val = 1;

        get val2() {
          return 2 * this.val;
        }

        changeVal(val: number) {
          this.val = val;
        }
      }

      const [store1, useStore1] = createStore(new Store1());

      class Store2 {
        get doubleVal() {
          return store1.val * 2;
        }

        // nested compute
        get doubleVal2() {
          return store1.val2 * 2;
        }
      }

      const [store2, useStore2] = createStore(new Store2());

      const fn = jest.fn();

      function Component() {
        const store1 = useStore1();
        const store2 = useStore2();
        fn();
        return (
          <div>
            <div data-testid="val">{store2.doubleVal}</div>
            <div data-testid="val2">{store2.doubleVal2}</div>
            <button data-testid="btn" onClick={() => store1.changeVal(99)}>
              Change
            </button>
          </div>
        );
      }

      const tester = render(<Component />);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(tester.getByTestId("val")).toHaveTextContent("2");
      expect(tester.getByTestId("val2")).toHaveTextContent("4");

      await act(async () => {
        fireEvent.click(tester.getByTestId("btn"));
        delay(delayMs);
      });
      expect(fn).toHaveBeenCalledTimes(2); // re-render once
      expect(tester.getByTestId("val")).toHaveTextContent("198");
      expect(tester.getByTestId("val2")).toHaveTextContent("396");
    });
  });

  describe("multiple store", () => {
    class Store1 {
      val = 1;

      changeVal(val: number) {
        this.val = val;
      }
    }

    const [store1, useStore1] = createStore(new Store1());

    class Store2 {
      val = 10;

      changeVal(val: number) {
        this.val = val;
      }
    }

    const [store2, useStore2] = createStore(new Store2());

    const fn = jest.fn();

    function Component() {
      const store1 = useStore1();
      const store2 = useStore2();
      fn();
      return (
        <div>
          <div data-testid="val1">{store1.val}</div>
          <div data-testid="val2">{store2.val}</div>
          <button
            data-testid="btn"
            onClick={() => {
              store1.changeVal(99);
              store2.changeVal(66);
            }}
          >
            Change
          </button>
        </div>
      );
    }

    beforeEach(() => {
      render(<Component />);
    });

    it("re-render", async () => {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("val1")).toHaveTextContent("1");
      expect(screen.getByTestId("val2")).toHaveTextContent("10");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        delay(delayMs);
      });
      expect(fn).toHaveBeenCalledTimes(2); // re-render once
      expect(screen.getByTestId("val1")).toHaveTextContent("99");
      expect(screen.getByTestId("val2")).toHaveTextContent("66");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        delay(delayMs);
      });
      expect(fn).toHaveBeenCalledTimes(2); // no re-render
      expect(screen.getByTestId("val1")).toHaveTextContent("99");
      expect(screen.getByTestId("val2")).toHaveTextContent("66");
    });
  });

  describe("store extend", () => {
    it("support extend", async () => {
      class Count {
        count = 0;

        addCount() {
          this.count++;
        }
      }
      class Cart extends Count {
        price = 9;

        get total() {
          return this.price * this.count;
        }
      }

      const [cart, useCart] = createStore(new Cart());

      function Component() {
        const cart = useCart();
        return (
          <div>
            <div data-testid="cart">{cart.total}</div>
            <button data-testid="btn" onClick={cart.addCount}>
              add
            </button>
          </div>
        );
      }

      render(<Component />);

      expect(screen.getByTestId("cart")).toHaveTextContent("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });

      expect(screen.getByTestId("cart")).toHaveTextContent("9");
    });

    it("support extend override", async () => {
      class Count {
        count = 0;

        addCount() {
          this.count++;
        }

        get total() {
          return this.count * 1;
        }
      }

      class Cart extends Count {
        price = 9;

        addCount() {
          this.count += 2;
        }

        get total() {
          return this.price * this.count;
        }
      }

      const [cart, useCart] = createStore(new Cart());

      function Component() {
        const cart = useCart();
        return (
          <div>
            <div data-testid="cart">{cart.total}</div>
            <button data-testid="btn" onClick={cart.addCount}>
              add
            </button>
          </div>
        );
      }

      render(<Component />);

      expect(screen.getByTestId("cart")).toHaveTextContent("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });

      expect(screen.getByTestId("cart")).toHaveTextContent("18");
    });
  });

  describe("config store", () => {
    class Count {
      count = 0;

      add() {
        this.count++;
      }
    }

    const [count] = createStore(new Count(), { storeName: "TEST" });

    it("debug log", async () => {
      // enable
      configStore({
        debug: true,
      });
      count.add();
      expect(logSpy).toHaveBeenCalled();
      expect(logSpy.mock.calls[0][0]).toContain("[store]");
      expect(logSpy.mock.calls[0][1]).toContain("call action: TEST@S");

      // disable
      logSpy.mockClear();
      configStore({
        debug: false,
      });
      count.add();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("internal prop support", () => {
    it("toJSON", () => {
      class Count {
        count = 0;
      }

      const [count] = createStore(new Count());

      expect(JSON.stringify(count)).toBe('{"count":0}');
    });

    it("internal symbol", () => {
      class Count {
        count = 0;
      }

      const [count] = createStore(new Count(), { storeName: "Count" });

      expect(String(count)).toContain("[object Count");
    });

    it("internal symbol with hooks", async () => {
      class Count {
        count = 0;

        add() {
          this.count++;
        }
      }

      const [count, useCount] = createStore(new Count(), {
        storeName: "Count",
      });

      function Component() {
        const count = useCount();
        return (
          <div>
            <div data-testid="count">{count.count + String(count)}</div>
            <button data-testid="btn" onClick={count.add}>
              add
            </button>
          </div>
        );
      }

      render(<Component />);

      expect(screen.getByTestId("count")).toHaveTextContent("0[object Count");
      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("1[object Count");
    });
  });

  describe("others", () => {
    class Base {
      count = 0;

      add() {
        this.count++;
      }
    }

    class Count extends Base {
      count2 = 1;
    }

    const [count] = createStore(new Count());

    it("getPrototypeOf", () => {
      expect(Object.getPrototypeOf(count)).toBe(Count.prototype);
      expect(Base.prototype.isPrototypeOf(count)).toBe(true);
      expect(Count.prototype.isPrototypeOf(count)).toBe(true);
      expect(count instanceof Base).toBe(true);
      expect(count instanceof Count).toBe(true);
    });

    it("setPrototypeOf", () => {
      expect(() => Object.setPrototypeOf(count, {})).toThrow(
        'You should not do "setPrototypeOf" of a store!'
      );
    });

    it("has", () => {
      expect("count" in count).toBe(true);
      expect("count2" in count).toBe(true);
      expect("add" in count).toBe(true);
      expect("add2" in count).toBe(false);
    });

    it("ownKeys", () => {
      expect(Object.keys(count).sort()).toEqual(["add", "count", "count2"]);
    });

    it("defineProperty", () => {
      expect(() => Object.defineProperty(count, "count", {})).toThrow(
        'You should not do "defineProperty" of a store!'
      );
    });
  });
});
