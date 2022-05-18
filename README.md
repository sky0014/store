# store

A high-optimized multiple store for react and hooks.

Another single store library: [easystore](https://github.com/sky0014/easystore)

# Feature

- Simple, less code, almost no dependencies
- Support multiple stores
- Support immutable
- Support nested data
- Support computed
- Support sync/async actions
- React render optimized
- Easy to write, no boilerplate
- Good type IntelliSense

## Install

```bash
npm install @sky0014/store
```

## Usage

```typescript
// store.ts
import { createStore, Store, configStore } from "@sky0014/store";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

configStore({
  debug: true,
  useBatch: true, // if you use react>=18, don't need this
});

class App extends Store {
  // support nested data
  nest = {
    a: {
      count: 0,
      doubleCount: 0,
    },
  };

  // support computed
  get count() {
    return this.nest.a.count;
  }

  // sync action
  add() {
    this.nest.a.count++;
  }

  // async action
  async addAsync() {
    // call other action
    this.add();
    await delay(1000);
    // modify data directly with internal `set` in async action
    // `set` is the keyword, don't re-define it in store
    this.set(() => {
      this.nest.a.count += 100;
    });
  }
}

export const [app, useApp] = createStore(new App(), {
  storeName: "App", // customize your store name, used for debug info
});

// App.tsx
import "./App.css";
import { useEffect } from "react";
import { useApp } from "./store/app";

function App() {
  const app = useApp();

  useEffect(() => {
    console.log("nest changed!");
  }, [app.nest]);

  return (
    <>
      <div>{app.count}</div>
      <div>{app.nest.a.doubleCount}</div>
      <button onClick={app.add}> Add </button>
    </>
  );
}

export default App;
```

## Publish

If your first time publish a package, login first:

```bash
npm login --registry=https://registry.npmjs.org
```

Then you can publish:

```bash
npm run pub
```
