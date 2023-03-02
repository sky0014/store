# store

A high-optimized multiple store for react and hooks.

Another single store library: [easystore](https://github.com/sky0014/easystore)

# Feature

- Simple, less code, almost no dependencies
- Support React Native
- Support multiple stores
- Support immutable
- Support nested data
- Support computed
- Support sync/async actions
- React render optimized
- Easy to write, no boilerplate
- Good type IntelliSense
- Full unit test

## Install

```bash
npm install @sky0014/store
```

## Usage

```typescript
import { createStore, configStore, persist } from "@sky0014/store";
import { useEffect } from "react";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

configStore({
  debug: true,
});

// store
class AppStore {
  // support nested data
  nest = {
    a: {
      count: 0,
    },
  };

  // support computed (only re-computed when prop changed)
  get count() {
    return this.nest.a.count;
  }

  get doubleCount() {
    return this.count * 2;
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
    this.nest.a.count += 100;
  }
}

const [app, useApp] = createStore(new AppStore(), {
  storeName: "App", // customize your store name, used for debug info
});

// persist
persist(app, {
  key: "app",
  ver: 0,
  storage: localStorage,
});

// App
function App() {
  const app = useApp();

  useEffect(() => {
    console.log("nest changed!");
  }, [app.nest]);

  return (
    <>
      <div>{app.count}</div>
      <div>{app.doubleCount}</div>
      <button onClick={app.add}> Add </button>
      <button onClick={app.addAsync}> Add Async </button>
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
