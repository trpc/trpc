module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  rootDir: '../',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: ['./*/src/**/*.{ts,tsx,js,jsx}'],
  setupFiles: ['core-js', 'regenerator-runtime/runtime'],
};
