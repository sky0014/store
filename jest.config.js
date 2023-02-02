/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */

const base = {
  testEnvironment: "jsdom",
  transformIgnorePatterns: ["/node_modules/(?!unstable_batchedupdates)"],
  setupFilesAfterEnv: ["@testing-library/jest-dom/"],
};

const react18 = {
  ...base,
  displayName: "React 18",
};

const react17 = {
  ...base,
  displayName: "React 17",
  moduleNameMapper: {
    "^react$": "react-17",
    "^react-dom$": "react-dom-17",
    "^react-dom/test-utils$": "react-dom-17/test-utils", // `act` is here
    "^react-test-renderer$": "react-test-renderer-17",
    "^@testing-library/react$": "@testing-library/react-12",
  },
};

module.exports = {
  projects: [react17, react18],
};
