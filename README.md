# store

An easy store for react and hooks.

Another version: [easystore](https://github.com/sky0014/easystore)

# Feature

- Simple, less than 500 lines, no more dependencies
- Support multiple store
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
import { createStore, Produce } from "@sky0014/store";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class App {
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
  async addAsync(produce: Produce) {
    // call other action
    this.add();
    await delay(1000);
    // modify data directly with produce in async action
    produce(() => {
      this.nest.a.count += 100;
    });
  }
}

export default createStore(new App(), { debug: true, storeName: "App" });

// App.tsx
import "./App.css";
import app from "./store/app";
import { useEffect } from "react";
import { useStore } from "@sky0014/store";

function App() {
  const appStore = useStore(app);

  useEffect(() => {
    console.log("nest changed!");
  }, [appStore.nest]);

  return (
    <>
      <div>{appStore.count}</div>
      <div>{appStore.nest.a.doubleCount}</div>
      <button onClick={appStore.add}> Add </button>
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
