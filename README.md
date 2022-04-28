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

export const [app, useApp] = createStore(new App(), {
  debug: true,
  storeName: "App",
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
