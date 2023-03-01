/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */

const base = {
  testEnvironment: "jsdom",
  transformIgnorePatterns: ["/node_modules/(?!unstable_batchedupdates)"],
  setupFilesAfterEnv: ["@testing-library/jest-dom/"],
  testMatch: ["<rootDir>/test/web/**/*.[jt]s?(x)"],
  collectCoverageFrom: ["<rootDir>/src/**/*"],
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

const rn = {
  ...base,
  testEnvironment: "node", // should be "node"
  displayName: "React Native",
  preset: "react-native",
  testMatch: ["<rootDir>/test/native/**/*.[jt]s?(x)"],
  transformIgnorePatterns: [
    "/node_modules/(?!(@react-native|react-native|unstable_batchedupdates)/).*",
  ],
  transform: {
    // overwrite react-native jest-preset transform key (^.+\\.(js|ts|tsx)$)
    "^.+\\.(js|ts|tsx)$": [
      "babel-jest",
      {
        presets: ["module:metro-react-native-babel-preset"],
      },
    ],
  },
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  moduleNameMapper: {
    "^@testing-library/react$": "@testing-library/react-native",
  },
};

module.exports = {
  projects: [react17, react18, rn],
};
