import { PlaywrightTestConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
console.log(`ℹ️ Using base URL "${baseURL}"`);

const config: PlaywrightTestConfig = {
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true, baseURL },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], headless: true, baseURL },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], headless: true, baseURL },
    },
  ],
};

export default config;
