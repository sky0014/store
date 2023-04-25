# store

A high-optimized multiple store for react and hooks.

Another single store library: [easystore](https://github.com/sky0014/easystore)

# Feature

- Simple, less code, almost no dependencies
- Extremely user-friendly, no boilerplate
- Support React Native
- Support multiple stores
- Support immutable
- Support nested data
- Support computed
- Support sync/async actions
- React render optimized
- Good type IntelliSense
- Full unit test

## Install

```bash
npm install @sky0014/store
```

## Usage

### Simple way **(Strongly recommend)**

Used with babel plugin: [babel-plugin-sky0014-store-helper]()

It will do all dirty work for you, and you no need to care about what to observe, just code as you wish :)

Install

```bash
npm i babel-plugin-sky0014-store-helper --save-dev
```

Add to `babel.config.js`

```js
plugins: ["babel-plugin-sky0014-store-helper", ...],  // first place
```

Write Store:

```typescript
import { createStore, configStore, persist } from "@sky0014/store";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// config store
configStore({
  debug: true,
});

// define store
// store props could be changed only with store actions
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

// create store
const app = createStore(new AppStore(), {
  storeName: "App", // customize your store name, used for debug info
});

// persist store (if you want)
persist(app, {
  key: "app",
  ver: 0,
  storage: localStorage,
});

export { app };
```

### Use with Function Component **(Strongly Recommend)**

```typescript
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

// Use store(app) as you wish, when store changes, component will auto re-render
function App() {
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

// render
const root = document.getElementById("app");
if (root) {
  createRoot(root).render(<App />);
}
```

If you don't use `babel-plugin-sky0014-store-helper`, you should observe store manually:

```typescript
import { observe } from "@sky0014/store";
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

// Use store(app) as you wish, when store changes, component will auto re-render
function App() {
  useEffect(() => {
    console.log("nest changed!");
  }, [observe(app.nest)]);

  return (
    <>
      <div>{app.count}</div>
      <div>{app.doubleCount}</div>
      <button onClick={app.add}> Add </button>
      <button onClick={app.addAsync}> Add Async </button>
    </>
  );
}

// render
const root = document.getElementById("app");
if (root) {
  const Observed = observe(App);
  createRoot(root).render(<Observed />);
}
```

- All Function Component which used store should be observed
- Store values you want to watch also should be observed

### Used with Class Component **(Don't until you have to, like history component or third-party component)**

pass store props to class component:

```typescript
import { observe } from "@sky0014/store";
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

class App extends React.Component {
  render() {
    return <div>{this.props.a.count}</div>;
  }
}

// render
const root = document.getElementById("app");
if (root) {
  const Observed = observe(App);
  createRoot(root).render(<Observed a={app.nest.a} />);
}
```

use store props in class component:

```typescript
import { observe, connect } from "@sky0014/store";
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

class App extends React.Component {
  render() {
    return <div>{this.props.a.count}</div>;
  }
}

// render
const root = document.getElementById("app");
if (root) {
  const Observed = connect(
    () => ({
      a: app.nest.a,
    }),
    Component
  );
  createRoot(root).render(<Observed />);
}
```

If you use `babel-plugin-sky0014-store-helper`, only need to write `connect` yourself.

## Best practice

Strongly recommend use `babel-plugin-sky0014-store-helper` and `function component` to get best develop practice and running performance.

## Publish

If your first time publish a package, login first:

```bash
npm login --registry=https://registry.npmjs.org
```

Then you can publish:

```bash
npm run pub
```
