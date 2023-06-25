import serial from "@sky0014/serial";
import { PersistStorage, createStore, persist } from "../../src";
import { delay } from "../../src/util";

class Item {
  a = 100;

  get b() {
    return 101;
  }
}

serial.register({ Item });

class Count {
  a = 0;
  b = 1;
  c = 2;
  nest = {
    arr: [4, 5, 6],
    obj: {
      name: "store",
      author: "sky",
    },
  };

  change1() {
    this.a = 100;
    this.b = 200;
    this.c = 300;
    // @ts-ignore
    this.d = 400; // add dynamic prop
    this.nest.arr.push(7);
    // @ts-ignore
    this.nest.obj.email = "sky-wang@qq.com"; // add dynamic nest prop
  }

  change2() {
    // change nothing
  }

  changeA(val: number) {
    this.a = val;
  }
}

const makeTest = (
  map: Record<string, any>,
  mockStorage: PersistStorage,
  flushInterval: number,
  writeInterval: number
) => {
  const wait = flushInterval + writeInterval + 100;
  const getA = () => JSON.parse(map["count"]).data.a;

  beforeEach(() => {
    // @ts-ignore
    mockStorage.getItem.mockClear();
    // @ts-ignore
    mockStorage.setItem.mockClear();
  });

  it("get & set", async () => {
    const count = createStore(new Count());

    const { flush, cancel } = await persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
      flushInterval,
    });

    // init read && flush
    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);

    // change multiple props
    count.change1();
    await delay(wait);
    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(map["count"])).toEqual({
      __store__: true,
      ver: 0,
      data: {
        a: 100,
        b: 200,
        c: 300,
        d: 400,
        nest: {
          arr: [4, 5, 6, 7],
          obj: {
            name: "store",
            author: "sky",
            email: "sky-wang@qq.com",
          },
        },
      },
    });

    // change nothing
    count.change2();
    expect(mockStorage.setItem).toHaveBeenCalledTimes(2);

    // 频繁更新
    count.changeA(101);
    await delay(10); // store的更新是异步的，delay一会让其触发，从而多次触发persist
    await delay(writeInterval);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(3); // 立即触发写入，下次写入需要等待flushInterval
    count.changeA(102);
    await delay(10);
    count.changeA(103);
    await delay(10);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(3); // 间隔时间太短，还未实际写入
    expect(getA()).toBe(101);
    await delay(wait); // 超过一定时间才会进行第二次写入
    await delay(writeInterval);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(4);
    expect(getA()).toBe(103);

    // test flush
    await delay(wait);
    count.changeA(201);
    await delay(10);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(5);
    count.changeA(202);
    await delay(10);
    count.changeA(203);
    await delay(10);
    await flush(); // 强制flush，无需等待立即写入
    expect(mockStorage.setItem).toHaveBeenCalledTimes(6);
    expect(getA()).toBe(203);

    // flush确保当前写入成功
    count.changeA(301);
    await delay(10);
    await flush();
    expect(mockStorage.setItem).toHaveBeenCalledTimes(7);
    expect(getA()).toBe(301);
    count.changeA(302);
    await delay(10);
    await flush();
    expect(mockStorage.setItem).toHaveBeenCalledTimes(8);
    expect(getA()).toBe(302);
    count.changeA(303);
    await delay(10);
    await flush();
    expect(mockStorage.setItem).toHaveBeenCalledTimes(9);
    expect(getA()).toBe(303);

    // test cancel
    await delay(wait);
    cancel();
    count.changeA(304);
    await delay(10);
    await delay(wait);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(9);
    expect(getA()).toBe(303);
  }, 20000);

  it("read from storage", async () => {
    const count = createStore(new Count()); // new store
    expect(count.a).toBe(0);

    // init: read from storage
    const { cancel } = await persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    });

    expect(count.a).toBe(303);

    cancel();
  });

  it("blacklist", async () => {
    // no blacklist
    const count1 = createStore(new Count());
    const persistor1 = await persist(count1, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    });
    // read from storage
    expect(count1.a).toBe(303);
    // @ts-ignore
    expect(count1.d).toBe(400);
    persistor1.cancel();

    // use blacklist
    const count2 = createStore(new Count());
    const persistor2 = await persist(count2, {
      key: "count",
      ver: 0,
      storage: mockStorage,
      // @ts-ignore
      blackList: ["a", "nest", "d"],
    });
    // blacklist props will be ignored
    expect(count2.a).toBe(0);
    // @ts-ignore
    expect(count2.d).toBeUndefined();
    // not blacklist props will get storage value
    expect(count2.b).toBe(200);
    expect(count2.c).toBe(300);

    await delay(wait);
    // will get rid of blacklist props
    expect(JSON.parse(map["count"])).toEqual({
      __store__: true,
      ver: 0,
      data: {
        b: 200,
        c: 300,
      },
    });

    // blacklist props change will be ignored
    // @ts-ignore
    mockStorage.setItem.mockClear();
    count2.changeA(11);
    await delay(10);
    await persistor2.flush();
    expect(mockStorage.setItem).toHaveBeenCalledTimes(0);

    persistor2.cancel();
  });

  it("whitelist", async () => {
    const count1 = createStore(new Count());
    const persistor1 = await persist(count1, {
      key: "count",
      ver: 0,
      storage: mockStorage,
      whiteList: ["a", "b"],
    });
    expect(count1.a).toBe(0);
    expect(count1.b).toBe(200);
    expect(count1.c).toBe(2);
    persistor1.cancel();

    await delay(wait);
    // will only have whitelist props
    expect(JSON.parse(map["count"])).toEqual({
      __store__: true,
      ver: 0,
      data: {
        a: 0,
        b: 200,
      },
    });
  });

  it("blacklist & whitelist (whitelist first)", async () => {
    const count1 = createStore(new Count());
    const persistor1 = await persist(count1, {
      key: "count",
      ver: 0,
      storage: mockStorage,
      whiteList: ["a", "b"],
      blackList: ["a", "b"],
    });
    expect(count1.a).toBe(0);
    expect(count1.b).toBe(200);
    expect(count1.c).toBe(2);
    persistor1.cancel();

    await delay(wait);
    // will only have whitelist props
    expect(JSON.parse(map["count"])).toEqual({
      __store__: true,
      ver: 0,
      data: {
        a: 0,
        b: 200,
      },
    });
  });

  it("version update", async () => {
    const count = createStore(new Count());
    const onVerUpdate = jest.fn(() => ({ a: 1, b: 2, c: 3 }));
    const persistor = await persist(count, {
      key: "count",
      ver: 1,
      storage: mockStorage,
      onVerUpdate,
    });

    expect(onVerUpdate).toHaveBeenCalledWith(0, { a: 0, b: 200 });

    // 正常使用
    expect(count.a).toBe(1);
    expect(count.b).toBe(2);
    expect(count.c).toBe(3);
    count.changeA(101);
    await delay(10);
    await persistor.flush();
    expect(getA()).toBe(101);

    persistor.cancel();
  });

  it("no flush interval", async () => {
    const count = createStore(new Count());
    const persistor = await persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
      flushInterval: 0,
    });

    // 正常使用
    expect(count.a).toBe(101);
    expect(count.b).toBe(2);
    count.changeA(102);
    await delay(10);
    await persistor.flush();
    expect(getA()).toBe(102);

    persistor.cancel();
  });

  it("computed props should not be persist", async () => {
    class Count {
      count = 0;

      get doubleCount() {
        return 2 * this.count;
      }
    }

    // clear
    delete map["count"];

    const count = createStore(new Count());
    await persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    });
    expect(JSON.parse(map["count"])).toEqual({
      __store__: true,
      ver: 0,
      data: {
        count: 0,
      },
    });
  });

  it("read class from storage", async () => {
    class Count {
      items = [new Item()];

      change() {
        this.items[0].a = 200;
      }
    }

    const count = createStore(new Count());
    expect(count.items[0].a).toBe(100);
    expect(count.items[0].b).toBe(101);

    const { cancel } = await persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    });

    count.change();
    expect(count.items[0].a).toBe(200);
    expect(count.items[0].b).toBe(101);
    await delay(wait);
    cancel();

    const count2 = createStore(new Count()); // new store
    const { cancel: cancel2 } = await persist(count2, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    });
    expect(count2.items[0] instanceof Item).toBe(true);
    expect(count2.items[0].a).toBe(200);
    expect(count2.items[0].b).toBe(101);
    cancel2();
  });
};

describe("sync storage", () => {
  const map: Record<string, any> = {};
  const mockStorage: PersistStorage = {
    getItem: jest.fn((key) => map[key]),
    setItem: jest.fn((key, value) => {
      map[key] = value;
    }),
  };

  makeTest(map, mockStorage, 200, 10);
});

describe("async storage", () => {
  const map: Record<string, any> = {};
  const mockStorage: PersistStorage = {
    getItem: jest.fn(async (key) => {
      await delay(500);
      return map[key];
    }),
    setItem: jest.fn(async (key, value) => {
      await delay(500);
      map[key] = value;
    }),
  };

  makeTest(map, mockStorage, 300, 500);
});

describe("error boundary", () => {
  const makeTest = async (
    map: Record<string, any>,
    mockStorage: PersistStorage
  ) => {
    const count = createStore(new Count());

    persist(count, {
      key: "count",
      ver: 0,
      storage: mockStorage,
    }).catch((e) => {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toMatch("read storage data error:");
    });
  };

  it("read error", async () => {
    const map: Record<string, any> = {};
    const mockStorage: PersistStorage = {
      getItem: jest.fn(() => {
        throw new Error("read error");
      }),
      setItem: jest.fn((key, value) => {
        map[key] = value;
      }),
    };

    await makeTest(map, mockStorage);
  });

  it("read error (async)", async () => {
    const map: Record<string, any> = {};
    const mockStorage: PersistStorage = {
      getItem: jest.fn(async () => {
        await delay(100);
        throw new Error("read error");
      }),
      setItem: jest.fn((key, value) => {
        map[key] = value;
      }),
    };

    await makeTest(map, mockStorage);
  });

  it("read wrong text", async () => {
    const map: Record<string, any> = {
      count: "some other value",
    };
    const mockStorage: PersistStorage = {
      getItem: jest.fn((key) => map[key]),
      setItem: jest.fn((key, value) => {
        map[key] = value;
      }),
    };

    await makeTest(map, mockStorage);
  });

  it("read wrong json", async () => {
    const map: Record<string, any> = {
      count: "{}",
    };
    const mockStorage: PersistStorage = {
      getItem: jest.fn((key) => map[key]),
      setItem: jest.fn((key, value) => {
        map[key] = value;
      }),
    };

    await makeTest(map, mockStorage);
  });
});
