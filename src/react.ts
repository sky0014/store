import { useEffect, useReducer, useRef } from "react";
import { hookStore, Store, subscribeStore } from "./core";

interface StoreRef<T> {
  store: T;
  revoke: () => void;
  map: Set<string>;
  unsubscribe: () => boolean;
}

export function useStore<T extends Store>(store: T) {
  const storeRef = useRef<StoreRef<T>>();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  if (!storeRef.current) {
    const { proxy, revoke } = hookStore(store, {
      onDepend: (name) => storeRef.current!.map.add(name),
    });
    const unsubscribe = subscribeStore(proxy, (names) => {
      for (let name of names) {
        if (storeRef.current!.map.has(name)) {
          forceUpdate();
          break;
        }
      }
    });

    storeRef.current = {
      store: proxy,
      revoke,
      map: new Set(),
      unsubscribe,
    };
  }

  // 每次render清理，重新收集依赖
  storeRef.current.map.clear();

  useEffect(() => {
    return () => {
      // unmount清理
      storeRef.current?.unsubscribe();
      storeRef.current?.revoke();
      storeRef.current = undefined;
    };
  }, []);

  return storeRef.current.store;
}
