import React from "react";
import { act, render, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom";

import { createStore, Store } from "../src";
import { delay } from "../src/util";

describe("web store", () => {
  describe("plain prop", () => {
    class Count extends Store {
      count = 0;

      add() {
        this.count++;
      }

      async add2() {
        await delay(200);
        this.set(() => {
          this.count++;
        });
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

    const { result } = renderHook(() => useCount());

    it("get store value", () => {
      expect(result.current.count).toBe(0);
      expect(typeof result.current.add).toBe("function");
      expect(typeof result.current.add2).toBe("function");
    });

    it("sync action", () => {
      act(() => result.current.add());
      expect(result.current.count).toBe(1);
    });

    it("async action with 'set'", async () => {
      const p1 = act(() => result.current.add2());
      expect(result.current.count).toBe(1);
      await p1;
      expect(result.current.count).toBe(2);
    });

    it("async action: call other sync action", async () => {
      const p2 = act(() => result.current.add3());
      expect(result.current.count).toBe(2);
      await p2;
      expect(result.current.count).toBe(3);
    });

    it("async action: call other async action", async () => {
      const p3 = act(() => result.current.add4());
      expect(result.current.count).toBe(3);
      await p3;
      expect(result.current.count).toBe(5);
    });

    it("call action from outside", () => {
      count.add();
      expect(result.current.count).toBe(6);
    });
  });

  describe("nested prop", () => {
    class Count extends Store {
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
        this.set(() => {
          this.nest.a.count++;
        });
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

    const { result } = renderHook(() => useCount());
    const aOrginal = result.current.nest.a;
    const bOriginal = result.current.nest.b;

    it("get store value", () => {
      expect(result.current.nest.a.count).toBe(0);
      expect(typeof result.current.add).toBe("function");
      expect(typeof result.current.add2).toBe("function");
    });

    it("sync action", () => {
      act(() => result.current.add());
      expect(result.current.nest.a.count).toBe(1);
    });

    it("async action with 'set'", async () => {
      const p1 = act(() => result.current.add2());
      expect(result.current.nest.a.count).toBe(1);
      await p1;
      expect(result.current.nest.a.count).toBe(2);
    });

    it("async action: call other sync action", async () => {
      const p2 = act(() => result.current.add3());
      expect(result.current.nest.a.count).toBe(2);
      await p2;
      expect(result.current.nest.a.count).toBe(3);
    });

    it("async action: call other async action", async () => {
      const p3 = act(() => result.current.add4());
      expect(result.current.nest.a.count).toBe(3);
      await p3;
      expect(result.current.nest.a.count).toBe(5);
    });

    it("call action from outside", () => {
      count.add();
      expect(result.current.nest.a.count).toBe(6);
    });

    it("nest.a is changed", () => {
      expect(aOrginal).not.toBe(result.current.nest.a);
    });

    it("nest.b is not changed", () => {
      expect(bOriginal).toBe(result.current.nest.b);
    });
  });

  describe("error boundary", () => {
    it("symbol prop", () => {
      const test = Symbol("test");

      class Count extends Store {
        [test] = 0;
      }

      expect(() => createStore(new Count())).toThrow(
        "symbol in store not supported!"
      );
    });

    it("'set' prop", () => {
      class Count extends Store {
        // @ts-ignore
        set = 0;
      }

      // @ts-ignore
      expect(() => createStore(new Count())).toThrow(
        "set is a store keyword, DON'T use it!"
      );
    });

    it("'set' action", () => {
      class Count extends Store {
        // @ts-ignore
        set() {}
      }

      expect(() => createStore(new Count())).toThrow(
        "set is a store keyword, DON'T use it!"
      );
    });
  });
});
