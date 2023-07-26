# store

A high-optimized multiple store for react and hooks.

Another single store library: [easystore](https://github.com/sky0014/easystore)

## Feature

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

### Write Store

write store is simple, just a commom class.

getter is computed (don't use setter)

method is actions (store prop can only be changed with actions)

```typescript
import { createStore, configStore, persist, serial } from "@sky0014/store";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// config store
configStore({
  debug: true, // enable debug
  autoMemo: true, // enable auto memo observed component
  autoMerge: true, // enable auto merge store data
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
// When you need persist serialization, register these types:
// serial.register({ SomeClass });
persist(app, {
  key: "app",
  ver: 0,
  storage: localStorage,
});

export { app };
```

### With babel plugin: [babel-plugin-sky0014-store-helper](https://www.npmjs.com/package/babel-plugin-sky0014-store-helper) **_(Strongly recommend)_**

The Simplest way.

It will do all dirty work for you, and you no need to care about what to observe, just code as you wish :)

#### Config [babel-plugin-sky0014-store-helper](https://www.npmjs.com/package/babel-plugin-sky0014-store-helper)

Install

```bash
npm i babel-plugin-sky0014-store-helper --save-dev
```

Add to `babel.config.js`

```js
plugins: ["babel-plugin-sky0014-store-helper", ...],  // first place
```

If you use custom import alias:

```js
import something from "@src/something";
```

This plugin will auto read `tsconfig.json -> paths` attribute to handle that.

Otherwise, you should pass alias to plugin like this (just like `webpack config alias`):

```js
plugins: [["babel-plugin-sky0014-store-helper", { alias: { "@src": "xxxxx" } }], ...],  // first place
```

#### Used with Function Component **_(Strongly Recommend)_**

Used with Function Component will get all the benefit: simple to code, best performance.

FC is first class supported.

```typescript
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

// Use store: app as you wish, when store changes, component will auto re-render
function App() {
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

#### Used with Class Component

**_(Don't until you have to, like history component or third-party component)_**

Don't directly use store in class component like fc does, it cannot be traced, you should pass store props to class component.

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

### Without `babel-plugin-sky0014-store-helper`, observe on your own

If you don't use `babel-plugin-sky0014-store-helper`, you should observe component manually:

#### Used with Function Component **_(Strongly Recommend)_**

```typescript
import { observe } from "@sky0014/store";
import { createRoot } from "react-dom/client";
import { app } from "./store/app";

// Use store: app as you wish, when store changes, component will auto re-render
function App() {
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
  // observe the component that used store
  const Observed = observe(App);
  createRoot(root).render(<Observed />);
}
```

#### Used with Class Component

**_(Don't until you have to, like history component or third-party component)_**

Don't directly use store in class component like fc does, it cannot be traced, you should pass store props to class component:

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

class component will auto use full observe.

#### Component can't be traced (third party component etc ...)

What's happened in these component can not be traced, so it should use full observe:

```typescript
import { observe } from "@sky0014/store";
import { createRoot } from "react-dom/client";
import { app } from "./store/app";
import App from "some-third-party-lib";

// render
const root = document.getElementById("app");
if (root) {
  // full observe
  const Observed = observe(App, { full: true });
  createRoot(root).render(<Observed a={app.nest.a} />);
}
```

### observe store props

When there is some store props you want to watch, you should observe it too:

```typescript
import { observe } from "@sky0014/store";
import { app } from "./store/app";

function App() {
  // observe app.nest, when app.nest or it's sub props changed, this component will be re-rendered
  observe(app.nest);

  return null;
}
```

## Best practice

Strongly recommend use `babel-plugin-sky0014-store-helper` and `function component` to get best develop practice and performance.

## At last

Without `babel-plugin-sky0014-store-helper`, you should do these manually:

- All Component which used store should be observed
- component that can not be traced should use full observe

These is optional whenever you use the plugin:

- If you want to watch store props, observe it.

## Publish

If your first time publish a package, login first:

```bash
npm login --registry=https://registry.npmjs.org
```

Then you can publish:

```bash
npm run pub
```
