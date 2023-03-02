import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import externals from "rollup-plugin-node-externals";

export default [
  {
    input: "src/index.ts",
    output: {
      dir: "lib",
    },
    plugins: [typescript(), externals()],
  },
  {
    input: "src/index.ts",
    output: [{ file: "lib/index.d.ts", format: "es" }],
    plugins: [dts()],
  },
];
