import React, { useEffect } from "react";
import {
  act,
  fireEvent,
  getByTestId,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom";

import { createStore } from "../src";
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
          <div data-testid="count">{count.nest.a.count}</div>
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
  });

  describe("error boundary", () => {
    it("should not use symbol props", () => {
      const test = Symbol("test");

      class Count {
        [test] = 0;
      }

      expect(() => createStore(new Count())).toThrow(
        "Symbol in store not supported!"
      );
    });

    it("should not modify data directly", () => {
      class Count {
        count = 0;
      }

      const [count] = createStore(new Count());

      expect(() => count.count++).toThrow("Do not allowed modify data");
    });

    it("should not modify data in getter", () => {
      class Count {
        _count = 0;

        get count() {
          this._count = 99;
          return this._count;
        }
      }

      const [count] = createStore(new Count());

      expect(() => count.count).toThrow("Do not allowed modify data");
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

  describe("batch update", () => {});

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
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(2);
      expect(tester.getByTestId("test")).toHaveTextContent("11");

      // change from outside
      await act(async () => {
        price.changePrice(2);
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(3);
      expect(tester.getByTestId("test")).toHaveTextContent("22");

      // change other, no need to compute
      await act(async () => {
        fireEvent.click(tester.getByTestId("other"));
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(3);
      expect(tester.getByTestId("test")).toHaveTextContent("22");

      // change multiple times, compute only once(useBatch)
      await act(async () => {
        price.changePrice(3);
        price.changePrice(4);
        price.changePrice(5);
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(4);
      expect(tester.getByTestId("test")).toHaveTextContent("55");

      // test condition compute
      await act(async () => {
        price.changePrice(0);
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(4);
      expect(tester.getByTestId("test")).toHaveTextContent("999");
      await act(async () => {
        price.changePrice(6);
        await delay(500);
      });
      expect(count).toHaveBeenCalledTimes(5);
      expect(tester.getByTestId("test")).toHaveTextContent("66");
    });

    it("compute with other store", async () => {
      class Store1 {
        val = 1;

        changeVal(val: number) {
          this.val = val;
        }
      }

      const [store1, useStore1] = createStore(new Store1());

      class Store2 {
        get doubleVal() {
          return store1.val * 2;
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
            <div data-testid="val2">{store2.doubleVal}</div>
            <button data-testid="btn" onClick={() => store1.changeVal(99)}>
              Change
            </button>
          </div>
        );
      }

      const tester = render(<Component />);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(tester.getByTestId("val2")).toHaveTextContent("2");

      await act(async () => {
        fireEvent.click(tester.getByTestId("btn"));
        delay(500);
      });
      expect(fn).toHaveBeenCalledTimes(2); // re-render once
      expect(tester.getByTestId("val2")).toHaveTextContent("198");
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

    it("re-render", async () => {
      const tester = render(<Component />);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(tester.getByTestId("val1")).toHaveTextContent("1");
      expect(tester.getByTestId("val2")).toHaveTextContent("10");

      await act(async () => {
        fireEvent.click(tester.getByTestId("btn"));
        delay(500);
      });
      expect(fn).toHaveBeenCalledTimes(2); // re-render once
      expect(tester.getByTestId("val1")).toHaveTextContent("99");
      expect(tester.getByTestId("val2")).toHaveTextContent("66");

      await act(async () => {
        fireEvent.click(tester.getByTestId("btn"));
        delay(500);
      });
      expect(fn).toHaveBeenCalledTimes(2); // no re-render
      expect(tester.getByTestId("val1")).toHaveTextContent("99");
      expect(tester.getByTestId("val2")).toHaveTextContent("66");
    });
  });

  describe("other", () => {
    it("multiple store instance", async () => {
      class Count {
        count = 0;

        add() {
          this.count++;
        }
      }

      const [count, useCount] = createStore(new Count());
      const [count2, useCount2] = createStore(new Count());

      function Component() {
        const count = useCount();
        const count2 = useCount2();
        return (
          <div>
            <div data-testid="count">{count.count * 10 + count2.count}</div>
            <button
              data-testid="btn"
              onClick={async () => {
                count.add();
                await delay(1000);
                count2.add();
              }}
            >
              add
            </button>
          </div>
        );
      }

      render(<Component />);

      expect(screen.getByTestId("count")).toHaveTextContent("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
        await delay(delayMs);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("10");
      await act(async () => {
        // 需要使用act包裹，否则可能警告：
        // Warning: An update to Component inside a test was not wrapped in act(...).
        await delay(1000);
      });
      expect(screen.getByTestId("count")).toHaveTextContent("11");
    });
  });
});
