module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  rootDir: '../',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    './*/src/**/*.{ts,tsx,js,jsx}',
    // Ignore deprecated from codecov
    '!**/deprecated/**',
  ],
  setupFilesAfterEnv: [
    // './server/jest.setup.js',
    '@testing-library/jest-dom/extend-expect',
  ],
  "plugins": ["@babel/plugin-proposal-decorators"],

  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
        target: 'ES2020',
        noUnusedLocals: false,
        noUnusedParameters: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true
      },
    },
  },
  // setupFiles: ['core-js', 'regenerator-runtime/runtime'],
};
