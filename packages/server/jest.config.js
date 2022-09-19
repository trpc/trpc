/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
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
  transform: {
    '^.+.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
          target: 'ES2020',
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  // setupFiles: ['core-js', 'regenerator-runtime/runtime'],
};
