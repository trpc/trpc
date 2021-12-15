module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  rootDir: '../',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: ['./*/src/**/*.{ts,tsx,js,jsx}'],
  setupFilesAfterEnv: ['./server/jest.setup.js'],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
        target: 'ES2020',
      },
    },
  },
  // setupFiles: ['core-js', 'regenerator-runtime/runtime'],
};
