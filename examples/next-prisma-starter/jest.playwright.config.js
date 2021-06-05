module.exports = {
  verbose: true,
  preset: 'jest-playwright-preset',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testMatch: ['<rootDir>/playwright/**/?(*.)+(spec|test).[jt]s?(x)'],
  testEnvironmentOptions: {
    'jest-playwright': {
      browsers: ['chromium' /*, 'firefox', 'webkit'*/],
      exitOnPageError: false, // GitHub currently throws errors
      launchOptions: {
        headless: true,
      },
      contextOptions: {
        recordVideo: {
          dir: 'playwright/videos/',
        },
      },
      collectCoverage: true,
    },
  },
};
