/* istanbul ignore file */
import logSpy from "./logmock.test"; // 必须在src之前导入

import React, {
  PropsWithChildren,
  Suspense,
  createRef,
  forwardRef,
  lazy,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  configStore,
  createStore,
  observe,
  serial,
  subscribeStore,
} from "../../src";
import { delay } from "../../src/util";

const delayMs = 100;

jest.setTimeout(999999);

export const makeTest = (View: any, isNative = false) => {
  const click = (...args: any[]) => {
    // @ts-ignore
    fireEvent[isNative ? "press" : "click"](...args);
  };

  describe("store", () => {
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

      const count = createStore(new Count());

      const Component = observe(() => {
        return (
          <View>
            <View testID="count">{count.count}</View>
            <View testID="btn" onClick={count.add}>
              add
            </View>
          </View>
        );
      });

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
          click(screen.getByTestId("btn"));
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
          // @ts-ignore
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

      const count = createStore(new Count());

      const funcA = jest.fn();
      const funcB = jest.fn();

      const Component = observe(() => {
        useEffect(funcA, [count.nest.a]);
        useEffect(funcB, [count.nest.b]);

        return (
          <View>
            <View testID="count">{count.nest.a?.count ?? "none"}</View>
            {/* @ts-ignore */}
            <View testID="dynamic">{count.nest["d"] ?? "none"}</View>
            {/* @ts-ignore */}
            <View testID="dynamic2">{count["abc"] ?? "none"}</View>
            <View testID="array">{count.nest.arr.join(",")}</View>
            <View testID="btn" onClick={count.add}>
              add
            </View>
          </View>
        );
      });

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
          click(screen.getByTestId("btn"));
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

      it("change nested array", async () => {
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

    describe("array prop", () => {
      class Count {
        arr = [1, 2, 3];

        push(val: number) {
          this.arr.push(val);
        }

        set1(val: number) {
          this.arr[1] = val;
        }

        set2(arr: number[]) {
          this.arr = arr;
        }
      }

      const count = createStore(new Count());

      const Component = observe(() => {
        return <View testID="array[1]">{count.arr[1]}</View>;
      });

      it("change array element", async () => {
        render(<Component />);

        expect(screen.getByTestId("array[1]")).toHaveTextContent("2");

        await act(async () => {
          count.push(4);
          await delay(delayMs);
        });
        expect(screen.getByTestId("array[1]")).toHaveTextContent("2");

        await act(async () => {
          count.set1(100);
          await delay(delayMs);
        });
        expect(screen.getByTestId("array[1]")).toHaveTextContent("100");

        await act(async () => {
          count.set2([1, 100, 3, 4]);
          await delay(delayMs);
        });
        expect(screen.getByTestId("array[1]")).toHaveTextContent("100");

        await act(async () => {
          count.set2([1, 2, 3, 4]);
          await delay(delayMs);
        });
        expect(screen.getByTestId("array[1]")).toHaveTextContent("2");
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

        const count = createStore(new Count());

        expect(() => count.count++).toThrow("Do not allowed modify data");
        // @ts-ignore
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

        const count = createStore(new Count());

        expect(() => count.nest.a.b++).toThrow("Do not allowed modify data");
        // @ts-ignore
        expect(() => delete count.nest.a.b).toThrow(
          "Do not allowed modify data"
        );
      });

      it("should not modify data in getter", () => {
        class Count {
          _count = 0;

          get count() {
            this._count = 99;
            return this._count;
          }

          get count2() {
            // @ts-ignore
            delete this._count;
            return 0;
          }
        }

        const count = createStore(new Count());

        expect(() => count.count).toThrow("Do not allowed modify data");
        expect(() => count.count2).toThrow("Do not allowed modify data");
      });

      it("should not have setter in Store", () => {
        class Count {
          _count = 0;

          get count() {
            return this._count;
          }

          set count(val: number) {
            this._count = val;
          }
        }

        const count = createStore(new Count());

        expect(() => count.count).toThrow("Do not allow setter");
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

        const count = createStore(new Count());

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

        const count = createStore(new Count());

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

      const count = createStore(new Count());

      const Component = observe(() => {
        renderFn();
        return (
          <View>
            <View testID="count">{count.count}</View>
            <View testID="nest">{count.nest["test"] ?? "none"}</View>
            <View
              testID="btn"
              onClick={() => {
                count.add();
                count.add();
                count.add();
              }}
            >
              add
            </View>
          </View>
        );
      });

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

      it("batch multiple sync update(click View)", async () => {
        await act(async () => {
          click(screen.getByTestId("btn"));
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

      const price = createStore(new Price());

      const Component = observe(() => {
        return (
          <View>
            <View testID="test">{price.money}</View>
            <View testID="test2">{price.doubleMoney}</View>
            <View testID="btn" onClick={price.addCount}>
              Add Count
            </View>
            <View testID="other" onClick={price.changeOther}>
              Change Other
            </View>
          </View>
        );
      });

      it("support computed", async () => {
        const tester = render(<Component />);

        // init compute
        expect(count).toHaveBeenCalledTimes(1);
        expect(tester.getByTestId("test")).toHaveTextContent("10");

        // change from render element
        await act(async () => {
          click(tester.getByTestId("btn")); // re-render will delay
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
          click(tester.getByTestId("other"));
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

        const store1 = createStore(new Store1());

        class Store2 {
          get doubleVal() {
            return store1.val * 2;
          }

          // nested compute
          get doubleVal2() {
            return store1.val2 * 2;
          }
        }

        const store2 = createStore(new Store2());

        const fn = jest.fn();

        const Component = observe(() => {
          fn();
          return (
            <View>
              <View testID="val">{store2.doubleVal}</View>
              <View testID="val2">{store2.doubleVal2}</View>
              <View testID="btn" onClick={() => store1.changeVal(99)}>
                Change
              </View>
            </View>
          );
        });

        const tester = render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(tester.getByTestId("val")).toHaveTextContent("2");
        expect(tester.getByTestId("val2")).toHaveTextContent("4");

        await act(async () => {
          click(tester.getByTestId("btn"));
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // re-render once
        expect(tester.getByTestId("val")).toHaveTextContent("198");
        expect(tester.getByTestId("val2")).toHaveTextContent("396");
      });

      it("computed use Object.keys", async () => {
        const fn = jest.fn();
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          get data() {
            fn();
            return Object.keys(this.nest);
          }

          change() {
            this.nest["c"] = 3;
            this.nest["c"] = 4;
          }

          change2() {
            this.nest.b = 3;
          }
        }

        const count = createStore(new Count());

        expect(count.data).toEqual(["a", "b"]);
        expect(fn).toHaveBeenCalledTimes(1);

        count.change2();
        await delay(delayMs);
        expect(count.data).toEqual(["a", "b"]);
        expect(fn).toHaveBeenCalledTimes(1);

        count.change();
        // change immediatly
        expect(count.data).toEqual(["a", "b", "c"]);
        await delay(delayMs);
        expect(count.data).toEqual(["a", "b", "c"]);
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it("computed use Object.keys 2", async () => {
        const fn = jest.fn();
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          get data() {
            fn();
            return this.nest;
          }

          change() {
            this.nest["c"] = 3;
          }

          change2() {
            this.nest.b = 3;
          }
        }

        const count = createStore(new Count());

        expect(Object.keys(count.data)).toEqual(["a", "b"]);
        expect(fn).toHaveBeenCalledTimes(1);

        count.change2();
        await delay(delayMs);
        expect(Object.keys(count.data)).toEqual(["a", "b"]);
        expect(fn).toHaveBeenCalledTimes(2);

        count.change();
        // change immediatly
        expect(Object.keys(count.data)).toEqual(["a", "b", "c"]);
        await delay(delayMs);
        expect(Object.keys(count.data)).toEqual(["a", "b", "c"]);
        expect(count.data === count.nest).toBe(true);
        expect(fn).toHaveBeenCalledTimes(4);
      });

      it("computed use json", async () => {
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          get data() {
            return JSON.stringify(this.nest);
          }

          change() {
            this.nest["c"] = 3;
          }
        }

        const count = createStore(new Count());

        expect(count.data).toEqual(JSON.stringify({ a: 1, b: 2 }));
        count.change();
        expect(count.data).toEqual(JSON.stringify({ a: 1, b: 2, c: 3 }));
      });

      it("computed value used immediately", async () => {
        class Count {
          count = 1;

          price = 10;

          get total() {
            return this.count * this.price;
          }

          change() {
            this.count++;
            this.count++;
            this.count = this.total;
          }
        }

        const count = createStore(new Count());

        expect(count.total).toBe(10);
        count.change();
        expect(count.total).toBe(300);
      });

      it("computed fn run times", async () => {
        const fn = jest.fn();
        class Count {
          count = 1;

          price = 10;

          other = 11;

          get total() {
            fn();
            return this.count * this.price;
          }

          change1() {
            this.other++;
          }

          change2() {
            this.count++;
          }

          change3() {
            this.count++;
            this.count--;
          }
        }

        const count = createStore(new Count());

        expect(fn).toHaveBeenCalledTimes(0);
        expect(count.total).toBe(10);
        expect(fn).toHaveBeenCalledTimes(1);
        count.change1();
        expect(count.total).toBe(10);
        expect(fn).toHaveBeenCalledTimes(1);
        count.change2();
        expect(count.total).toBe(20);
        expect(fn).toHaveBeenCalledTimes(2);
        count.change3();
        expect(count.total).toBe(20);
        expect(fn).toHaveBeenCalledTimes(3); // should be called because computed value maybe used in change3 immediately
      });

      it("computed trigger re-render", async () => {
        const fn = jest.fn();

        class Count {
          doneTime: number;

          get isDone() {
            return !!this.doneTime;
          }

          done() {
            this.doneTime = Date.now();
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          fn();
          return <View testID="test">{String(count.isDone)}</View>;
        });

        render(<Component />);

        expect(fn).toBeCalledTimes(1);
        expect(screen.getByTestId("test")).toHaveTextContent("false");
        await act(async () => {
          count.done();
          delay(delayMs);
        });
        expect(fn).toBeCalledTimes(2);
        expect(screen.getByTestId("test")).toHaveTextContent("true");
        await act(async () => {
          count.done();
          delay(delayMs);
        });
        expect(fn).toBeCalledTimes(2); // should not be called
        expect(screen.getByTestId("test")).toHaveTextContent("true");
      });

      it("computed trigger re-render 2", async () => {
        const fn = jest.fn();

        class Count {
          count = 0;

          get count2() {
            return this.count * 2;
          }

          change(n: number) {
            this.count = n;
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          fn();
          return <View testID="test">{String(count.count2)}</View>;
        });

        render(<Component />);

        expect(fn).toBeCalledTimes(1);
        expect(screen.getByTestId("test")).toHaveTextContent("0");
        await act(async () => {
          count.change(1);
          delay(delayMs);
        });
        expect(fn).toBeCalledTimes(2);
        expect(screen.getByTestId("test")).toHaveTextContent("2");
        await act(async () => {
          count.change(2);
          expect(count.count2).toBe(4);
          count.change(1); // restore computed
          expect(count.count2).toBe(2);
          delay(delayMs);
        });
        expect(fn).toBeCalledTimes(2); // should not be called
        expect(screen.getByTestId("test")).toHaveTextContent("2");
      });

      it("computed nested deep", async () => {
        class Count {
          nest = {
            a: {
              b: {
                c: 100,
              },
            },
            d: {},
          };

          get a() {
            return this.nest.a;
          }

          change() {
            this.nest.a.b.c = 99;
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          return <View testID="test">{count.a.b.c}</View>;
        });

        render(<Component />);

        expect(screen.getByTestId("test")).toHaveTextContent("100");
        await act(async () => {
          count.change();
          delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("99");
      });

      it("computed nested deep 2", async () => {
        class Nest {
          a = {
            b: {
              c: 100,
            },
          };

          get c() {
            return this.a.b.c;
          }
        }

        class Count {
          nest = new Nest();

          change() {
            this.nest.a.b.c = 99;
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          return <View testID="test">{count.nest.c}</View>;
        });

        render(<Component />);

        expect(screen.getByTestId("test")).toHaveTextContent("100");
        await act(async () => {
          count.change();
          delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("99");
      });

      it("computed in computed 1", async () => {
        class Count {
          nest = {
            count: 0,
          };

          get obj() {
            return { val: this.nest };
          }

          get obj2() {
            return this.obj;
          }

          change() {
            this.nest.count = 100;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Observed = observe(() => {
          fn();
          count.obj2;
          return null;
        });

        render(<Observed />);

        expect(fn).toHaveBeenCalledTimes(1);
        await act(async () => {
          count.change();
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it("computed in computed 2", async () => {
        class Count {
          nest = {
            count: 0,
          };

          get obj() {
            return { val: this.nest };
          }

          get obj2() {
            return this.obj ? 1 : 0;
          }

          change() {
            this.nest.count = 100;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Observed = observe(() => {
          fn();
          count.obj2;
          return null;
        });

        render(<Observed />);

        expect(fn).toHaveBeenCalledTimes(1);
        await act(async () => {
          count.change();
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it("computed in sub prop", async () => {
        class Todo {
          doneTime = 0;

          get isDone() {
            return !!this.doneTime;
          }

          done() {
            this.doneTime = Date.now();
          }
        }

        class Count {
          todos: Todo[] = [new Todo()];
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Observed = observe(() => {
          fn();
          return (
            <View testID="isDone">
              {count.todos[0].isDone ? "done" : "nop"}
            </View>
          );
        });

        render(<Observed />);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("isDone")).toHaveTextContent("nop");
        await act(async () => {
          count.todos[0].done();
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("isDone")).toHaveTextContent("done");
      });
    });

    describe("multiple store", () => {
      class Store1 {
        val = 1;

        changeVal(val: number) {
          this.val = val;
        }
      }

      const store1 = createStore(new Store1());

      class Store2 {
        val = 10;

        changeVal(val: number) {
          this.val = val;
        }
      }

      const store2 = createStore(new Store2());

      const fn = jest.fn();

      const Component = observe(() => {
        fn();
        return (
          <View>
            <View testID="val1">{store1.val}</View>
            <View testID="val2">{store2.val}</View>
            <View
              testID="btn"
              onClick={() => {
                store1.changeVal(99);
                store2.changeVal(66);
              }}
            >
              Change
            </View>
          </View>
        );
      });

      beforeEach(() => {
        render(<Component />);
      });

      it("re-render", async () => {
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("val1")).toHaveTextContent("1");
        expect(screen.getByTestId("val2")).toHaveTextContent("10");

        await act(async () => {
          click(screen.getByTestId("btn"));
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // re-render once
        expect(screen.getByTestId("val1")).toHaveTextContent("99");
        expect(screen.getByTestId("val2")).toHaveTextContent("66");

        await act(async () => {
          click(screen.getByTestId("btn"));
          delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // no re-render
        expect(screen.getByTestId("val1")).toHaveTextContent("99");
        expect(screen.getByTestId("val2")).toHaveTextContent("66");
      }, 999999);
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

        const cart = createStore(new Cart());

        const Component = observe(() => {
          return (
            <View>
              <View testID="cart">{cart.total}</View>
              <View testID="btn" onClick={cart.addCount}>
                add
              </View>
            </View>
          );
        });

        render(<Component />);

        expect(screen.getByTestId("cart")).toHaveTextContent("0");

        await act(async () => {
          click(screen.getByTestId("btn"));
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

        const cart = createStore(new Cart());

        const Component = observe(() => {
          return (
            <View>
              <View testID="cart">{cart.total}</View>
              <View testID="btn" onClick={cart.addCount}>
                add
              </View>
            </View>
          );
        });

        render(<Component />);

        expect(screen.getByTestId("cart")).toHaveTextContent("0");

        await act(async () => {
          click(screen.getByTestId("btn"));
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

      const count = createStore(new Count(), { storeName: "TEST" });

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

      it("auto memo: true", async () => {
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          change() {
            this.nest = {
              a: 1,
              b: 3,
            };
          }
        }

        const count = createStore(new Count());

        configStore({
          autoMemo: true,
        });

        const fn1 = jest.fn();
        const fn2 = jest.fn();
        const Item = observe(({ a }: { a: number }) => {
          fn1();
          return <View testID="count">{a}</View>;
        });
        const Component = observe(() => {
          fn2();
          observe(count.nest);
          return <Item a={count.nest.a} />;
        });

        render(<Component />);

        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(2);
      });

      it("auto memo: false", async () => {
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          change() {
            this.nest = {
              a: 1,
              b: 3,
            };
          }
        }

        const count = createStore(new Count());

        configStore({
          autoMemo: false,
        });

        const fn1 = jest.fn();
        const fn2 = jest.fn();
        const Item = observe(({ a }: { a: number }) => {
          fn1();
          return <View testID="count">{a}</View>;
        });
        const Component = observe(() => {
          fn2();
          observe(count.nest);
          return <Item a={count.nest.a} />;
        });

        render(<Component />);

        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn1).toHaveBeenCalledTimes(2);
        expect(fn2).toHaveBeenCalledTimes(2);
      });

      it("auto merge object", async () => {
        configStore({ autoMerge: true });

        class Count {
          nest = {
            nest2: {
              a: 1,
              b: 2,
            },
          };

          change() {
            this.nest = {
              nest2: {
                a: 1,
                b: 2,
              },
            };
          }

          change2() {
            this.nest = {
              nest2: {
                a: 2,
                b: 2,
              },
            };
          }

          change3() {
            // @ts-ignore
            this.nest = [99];
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Component = observe(() => {
          fn();
          return <View testID="count">{count.nest?.nest2?.a ?? "empty"}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("1");
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("1");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("count")).toHaveTextContent("2");
        await act(async () => {
          count.change3();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(3);
        expect(screen.getByTestId("count")).toHaveTextContent("empty");

        configStore({ autoMerge: false });
      });

      it("auto merge array", async () => {
        configStore({ autoMerge: true });

        class Count {
          nest = {
            nest2: [{ name: "sky" }, { name: "count" }],
          };

          change() {
            this.nest = {
              nest2: [{ name: "sky" }, { name: "count" }],
            };
            this.nest.nest2.push({ name: "blabla" });
          }

          change2() {
            this.nest.nest2 = [{ name: "sky2" }, { name: "count" }];
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Component = observe(() => {
          fn();
          return <View testID="count">{count.nest.nest2[0].name}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("sky");
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("sky");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("count")).toHaveTextContent("sky2");

        configStore({ autoMerge: false });
      });

      it("auto merge class", async () => {
        configStore({ autoMerge: true });

        class Person {
          name: string;

          get hello() {
            return "hello " + this.name;
          }

          constructor(name: string) {
            this.name = name;
          }
        }

        class Count {
          nest = {
            person: new Person("sky"),
          };

          change() {
            this.nest = {
              person: new Person("sky"),
            };
          }

          change2() {
            this.nest.person = new Person("sky2");
          }
        }

        // support use auto merge with serial
        serial.register({
          Person,
        });

        const count = createStore(new Count());

        const fn = jest.fn();
        const Component = observe(() => {
          fn();
          return <View testID="count">{count.nest.person.hello}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("hello sky");
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("hello sky");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("count")).toHaveTextContent("hello sky2");

        configStore({ autoMerge: false });
      });
    });

    describe("internal prop support", () => {
      it("toJSON", () => {
        class Count {
          count = 0;
        }

        const count = createStore(new Count());

        expect(JSON.stringify(count)).toBe('{"count":0}');
      });

      it("internal symbol", () => {
        class Count {
          count = 0;
        }

        const count = createStore(new Count(), { storeName: "Count" });

        expect(String(count)).toContain("[object Count");
      });

      it("internal symbol with hooks", async () => {
        class Count {
          count = 0;

          add() {
            this.count++;
          }
        }

        const count = createStore(new Count(), {
          storeName: "Count",
        });

        const Component = observe(() => {
          return (
            <View>
              <View testID="count">{count.count + String(count)}</View>
              <View testID="btn" onClick={count.add}>
                add
              </View>
            </View>
          );
        });

        render(<Component />);

        expect(screen.getByTestId("count")).toHaveTextContent("0[object Count");
        await act(async () => {
          click(screen.getByTestId("btn"));
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("1[object Count");
      });
    });

    describe("re-render", () => {
      it("nest data changes trigger re-render 1", async () => {
        class Count {
          nest = {
            key1: 1,
          };

          push(n: number) {
            this.nest[`key${n}`] = n;
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          return (
            <View>
              {Object.values(count.nest).map((v, index) => (
                <View key={index} testID={`count${v}`}>
                  {v}
                </View>
              ))}
            </View>
          );
        });

        render(<Component />);

        expect(screen.getByTestId("count1")).toHaveTextContent("1");

        await act(async () => {
          count.push(9);
          await delay(delayMs);
        });
        expect(screen.getByTestId("count9")).toHaveTextContent("9"); // re-render
      });

      it("nest data changes trigger re-render 2", async () => {
        class Count {
          nest = {
            key1: 1,
          };

          push(n: number) {
            this.nest[`key${n}`] = n;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        const Component = observe(() => {
          useEffect(fn, [observe(count.nest)]);

          return <View>test</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => {
          count.push(9);
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // re-render
      });

      it("nest data changes trigger re-render 3", async () => {
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          change() {
            this.nest.b = Math.random();
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        const Component = observe(() => {
          fn();

          return <View>{count.nest.a}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1); // change b should not trigger re-render
      });

      it("nest data changes trigger re-render 4", async () => {
        class Count {
          nest = {
            a: 1,
            b: 2,
          };

          change() {
            this.nest.b = Math.random();
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        const Component = observe(() => {
          fn();

          useEffect(() => {}, [observe(count.nest)]);

          return <View>{count.nest.a}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // useEffect depend trigger re-render
      });

      it("array data changes trigger re-render 1", async () => {
        class Count {
          arr = [1, 2, 3];

          change() {
            this.arr.push(Math.random());
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        const Component = observe(() => {
          fn();

          return <View>{count.arr[0]}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1); // push at end should not trigger re-render
      });

      it("array data changes trigger re-render 2", async () => {
        class Count {
          arr = [1, 2, 3];

          change() {
            this.arr.push(Math.random());
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        const Component = observe(() => {
          fn();

          useEffect(() => {}, [observe(count.arr)]);

          return <View>{count.arr[0]}</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2); // useEffect depend trigger re-render
      });

      it("Object.keys trigger re-render", async () => {
        let index = 0;
        class Count {
          nest = {};

          change1() {
            this.nest[`prop${index++}`] = { deep: 1 };
          }

          change2() {
            this.nest["prop0"].deep = 2;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const Component = observe(() => {
          fn();
          return <View testID="test">{Object.keys(count.nest).join(",")}</View>;
        });

        render(<Component />);

        expect(screen.getByTestId("test")).toHaveTextContent("");
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("prop0");
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("prop0,prop1");
        fn.mockReset();
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("prop0,prop1");
        expect(fn).not.toBeCalled(); // change deep not trigger keys re-render
      });

      it("dynamic sub props trigger re-render", async () => {
        class Count {
          nest = {};

          change1() {
            Object.assign(this.nest, { a: { content: "hello" } });
          }

          change2() {
            Object.assign(this.nest, { a: { content: "world" } });
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          return <View testID="test">{count.nest["a"]?.content}</View>;
        });

        render(<Component />);

        expect(screen.getByTestId("test")).toHaveTextContent("");
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("hello");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent("world");
      });
    });

    describe("types", () => {
      it("object type and json", () => {
        class Count {
          data = {
            a: 1,
            b: 2,
          };
        }

        const count = createStore(new Count());
        expect(typeof count.data === "object").toBe(true);
        expect(JSON.stringify(count.data)).toBe(
          JSON.stringify({
            a: 1,
            b: 2,
          })
        );
      });
      it("array type and json", () => {
        class Count {
          data = [1, 2];
        }

        const count = createStore(new Count());
        expect(Array.isArray(count.data)).toBe(true);
        expect(JSON.stringify(count.data)).toBe(JSON.stringify([1, 2]));
      });
    });

    describe("observe", () => {
      it("observe with useEffect", async () => {
        class Count {
          nest = {
            count: 0,
          };

          add() {
            this.nest.count++;
          }
        }

        const count = createStore(new Count());
        const fn = jest.fn();

        const Component = observe(() => {
          useEffect(fn, [observe(count.nest)]);

          return <View>test</View>;
        });

        render(<Component />);

        expect(fn).toHaveBeenCalledTimes(1);
        await act(async () => {
          count.add();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it("observe none store values", async () => {
        expect(observe(99)).toBe(99);
        expect(observe({ a: 1 })).toEqual({ a: 1 });
      });

      it("nested props & nested Component 1", async () => {
        class Count {
          nested = {
            test: {
              name: "test",
            },
          };

          changeName() {
            this.nested.test.name = "test-changed";
          }
        }

        const count = createStore(new Count());

        const Component1 = observe(({ test }) => {
          return <View testID="count">{test.name}</View>;
        });

        const Component2 = observe(() => {
          return <Component1 test={count.nested.test} />;
        });

        render(<Component2 />);

        expect(screen.getByTestId("count")).toHaveTextContent("test");

        await act(async () => {
          count.changeName();
          await delay(delayMs);
        });

        expect(screen.getByTestId("count")).toHaveTextContent("test-changed");
      });

      it("nested props & nested Component 2", async () => {
        class Count {
          nested = {
            test: {
              name: "test",
            },
          };

          changeName() {
            this.nested.test.name = "test-changed";
          }
        }

        const count = createStore(new Count());

        const Component1 = ({ test }) => {
          return <View testID="count">{test.name}</View>;
        };

        const Component2 = observe(() => {
          return <Component1 test={observe(count.nested.test)} />;
        });

        render(<Component2 />);

        expect(screen.getByTestId("count")).toHaveTextContent("test");

        await act(async () => {
          count.changeName();
          await delay(delayMs);
        });

        expect(screen.getByTestId("count")).toHaveTextContent("test-changed");
      });

      it("child Component condition render", async () => {
        class Count {
          arr = [1, 2];

          push(n: number) {
            this.arr.push(n);
          }
        }

        const count = createStore(new Count());

        const Component1 = observe(({ arr }) => {
          const [flag, setFlag] = useState(0);

          return (
            <>
              <View testID="test">{flag ? JSON.stringify(arr) : "unset"}</View>
              <View testID="btn" onClick={() => setFlag(1)}>
                Change
              </View>
            </>
          );
        });

        const Component2 = observe(() => {
          return <Component1 arr={count.arr} />;
        });

        render(<Component2 />);

        expect(screen.getByTestId("test")).toHaveTextContent("unset");
        await act(async () => {
          click(screen.getByTestId("btn"));
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent(
          JSON.stringify([1, 2])
        );
        await act(async () => {
          count.push(3);
          await delay(delayMs);
        });
        expect(screen.getByTestId("test")).toHaveTextContent(
          JSON.stringify([1, 2, 3])
        );
      });

      it("observe forwardRef fc", async () => {
        class Count {
          nest = {
            val: 0,
            val2: 99,
          };

          change() {
            this.nest.val++;
          }

          change2() {
            this.nest.val2++;
          }
        }

        const count = createStore(new Count());

        const fn1 = jest.fn();

        const Item = observe(
          forwardRef(({ data }: { data: Count }, ref) => {
            fn1();

            return <View ref={ref}>{data.nest.val}</View>;
          }),
          { memo: true }
        );

        const ref = createRef();

        render(<Item data={count} ref={ref} />);

        expect(ref.current).not.toBeNull();
        expect(fn1).toBeCalledTimes(1);
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn1).toBeCalledTimes(2);
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn1).toBeCalledTimes(2);
      });

      it("observe memoed & forwardRef fc", async () => {
        class Count {
          arr = [
            {
              content: "test1",
              done: false,
            },
            {
              content: "test2",
              done: false,
            },
            {
              content: "test3",
              done: false,
            },
          ];

          change1() {
            this.arr.push({
              content: "test4",
              done: false,
            });
          }

          change2() {
            this.arr[1].done = true;
          }
        }

        const count = createStore(new Count());

        const fn1 = jest.fn();
        const fn2 = jest.fn();

        const Item = observe(
          memo(
            forwardRef(({ data }: { data: any }, ref) => {
              fn1();

              useEffect(() => {
                // @ts-ignore
                expect(ref.current).not.toBeNull();
              }, []);

              return (
                <View ref={ref}>
                  {data.content} {data.done}
                </View>
              );
            })
          )
        );

        const Component = observe(() => {
          fn2();

          const ref = useRef(null);

          return (
            <View>
              {count.arr.map((item, index) => (
                <Item key={index} data={item} ref={ref} />
              ))}
            </View>
          );
        });

        render(<Component />);

        expect(fn2).toBeCalledTimes(1);
        expect(fn1).toBeCalledTimes(3);
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(fn2).toBeCalledTimes(2);
        expect(fn1).toBeCalledTimes(4);
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn2).toBeCalledTimes(2);
        expect(fn1).toBeCalledTimes(5);
      });

      it("observe lazy component", async () => {
        // @ts-ignore
        if (globalThis.IS_RN) {
          // rn lazy test has unknown problem, skip. (Unable to find node on an unmounted component.)
          return;
        }

        class Count {
          nest = {
            val: 0,
            val2: 99,
          };

          change() {
            this.nest.val++;
          }

          change2() {
            this.nest.val2++;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const LazyComponent = observe(
          lazy(async () => {
            await delay(1000);
            return {
              default: ({ count }: { count: Count }) => {
                fn();
                return <View testID="count">{count.nest.val}</View>;
              },
            };
          })
        );

        render(
          <Suspense fallback={<View />}>
            <LazyComponent count={count} />
          </Suspense>
        );

        expect(fn).toHaveBeenCalledTimes(0);
        await act(async () => {
          await delay(1100); // wait for lazy load
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("count")).toHaveTextContent("0");
        await act(async () => {
          count.change();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("count")).toHaveTextContent("1");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("count")).toHaveTextContent("1");
      });

      it("observe multiple times", () => {
        const fc = jest.fn();
        const observed = observe(fc);
        expect(observe(observed)).toBe(observed);

        class Test extends React.Component {
          render() {
            return null;
          }
        }
        const observed2 = observe(Test);
        expect(observe(observed2)).toBe(observed2);
      });

      it("observe class component: pass props", async () => {
        class Count {
          count = 0;

          add() {
            this.count++;
          }
        }

        const count = createStore(new Count());

        class Component extends React.Component<
          PropsWithChildren<{ count: Count }>
        > {
          render() {
            return (
              <View testID="count">
                {this.props.children} {this.props.count.count}
              </View>
            );
          }
        }

        const Observed = observe(Component);

        render(<Observed count={count}>xxx</Observed>);

        expect(screen.getByTestId("count")).toHaveTextContent("xxx 0");
        await act(async () => {
          count.add();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("xxx 1");
      });

      it("observe class component: prevProps", async () => {
        class Count {
          nest = {
            c1: 0,
            c2: 1,
            d: {
              v: 2,
            },
          };

          change1() {
            this.nest.c1++;
          }

          change2() {
            this.nest.d = { v: 2 };
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        const fn2 = jest.fn();
        class Component extends React.Component<
          PropsWithChildren<{ count: Count; d: Count["nest"]["d"] }>
        > {
          componentDidUpdate(
            prevProps: Readonly<
              React.PropsWithChildren<{ count: Count; d: Count["nest"]["d"] }>
            >
          ): void {
            if (prevProps.count.nest.c1 !== this.props.count.nest.c1) {
              fn();
            }

            if (prevProps.d !== this.props.d) {
              fn2();
            }
          }

          render() {
            return null;
          }
        }

        const Observed = observe(Component);

        render(<Observed count={count} d={count.nest.d} />);

        expect(fn).toHaveBeenCalledTimes(0);
        expect(fn2).toHaveBeenCalledTimes(0);
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(0);
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);
      });

      it("observe third-party fc", async () => {
        class Count {
          nest = {
            count: 0,
          };

          add() {
            this.nest.count++;
          }
        }

        const count = createStore(new Count());

        // can not modify third-party component code, that means can not add observe.
        const ThirdPartyComponent = ({ nest }) => {
          return <View testID="count"> {nest.nest.count}</View>;
        };

        const App = observe(() => (
          <ThirdPartyComponent nest={observe({ nest: count.nest })} />
        ));

        render(<App />);

        expect(screen.getByTestId("count")).toHaveTextContent("0");
        await act(async () => {
          count.add();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("1");
      });

      it("observe third-party fc -> class component", async () => {
        class Count {
          nest = {
            c1: 0,
            c2: 1,
          };

          change1() {
            this.nest.c1++;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();
        class Component extends React.Component<
          PropsWithChildren<{ count: Count }>
        > {
          componentDidUpdate(
            prevProps: Readonly<React.PropsWithChildren<{ count: Count }>>
          ): void {
            if (prevProps.count.nest.c1 !== this.props.count.nest.c1) {
              fn();
            }
          }

          render() {
            return null;
          }
        }

        let Fc = ({ count }) => <Component count={count} />;
        // @ts-ignore
        Fc = memo(Fc);

        const Observed = observe(Fc, { full: true });

        render(<Observed count={count} />);

        expect(fn).toHaveBeenCalledTimes(0);
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(fn).toHaveBeenCalledTimes(1);
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

      const count = createStore(new Count());

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
        expect(Object.keys(count).sort()).toEqual(["count", "count2"]);
      });

      it("defineProperty", () => {
        expect(() => Object.defineProperty(count, "count", {})).toThrow(
          'You should not do "defineProperty" of a store!'
        );
      });

      it("subscribeStore", async () => {
        class Count {
          a = 1;

          nest = {
            a: {
              b: 100,
            },
          };

          change1(n: number) {
            this.a = n;
          }

          change2() {
            this.nest.a["c"] = 99;
          }
        }

        const count = createStore(new Count());

        const fn = jest.fn();

        subscribeStore(count, (names) => {
          fn([...names].map((name) => name.split(".").slice(1).join(".")));
        });
        count.change1(2);
        await delay(delayMs);
        expect(fn).toHaveBeenCalledWith(["a"]);

        fn.mockClear();
        count.change1(3);
        count.change2();
        await delay(delayMs);
        expect(fn).toHaveBeenCalledWith(["a", "nest.a.c"]);
      });

      it("state changed", async () => {
        class Count {
          nest = {
            nest2: {
              a: 1,
              b: 2,
            },
          };

          arr = [1, 2];

          change1() {
            this.nest = {
              nest2: {
                a: 2,
                b: 2,
              },
            };
          }

          change2() {
            this.nest.nest2.a = 3;
          }

          change3() {
            this.arr = [2, 2];
          }

          change4() {
            this.arr[0] = 3;
          }
        }

        const count = createStore(new Count());

        const Component = observe(() => {
          return (
            <View testID="count">
              {count.nest.nest2.a} {count.arr[0]}
            </View>
          );
        });

        render(<Component />);

        expect(screen.getByTestId("count")).toHaveTextContent("1 1");
        await act(async () => {
          count.change1();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("2 1");
        await act(async () => {
          count.change2();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("3 1");
        await act(async () => {
          count.change3();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("3 2");
        await act(async () => {
          count.change4();
          await delay(delayMs);
        });
        expect(screen.getByTestId("count")).toHaveTextContent("3 3");
      });

      it("constructor name", () => {
        class Count {}

        const count = createStore(new Count());

        expect(count.constructor.name).toBe("Count");
      });
    });
  });
};
