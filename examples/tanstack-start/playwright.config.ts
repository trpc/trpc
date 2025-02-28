import { Config, devices } from '@playwright/test';

const opts = {
  headless: !!process.env.CI || !!process.env.PLAYWRIGHT_HEADLESS,
};

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: Config = {
  testDir: './tests',
  reporter: [['line']],
  retries: 3,
  webServer: [
    {
      command: 'NITRO_PRESET=node_server pnpm build && pnpm start --port 3000',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev --port 3001',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
  ],

  projects: [
    {
      name: 'prod',
      use: {
        ...opts,
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000/',
      },
    },
    {
      name: 'dev',
      use: {
        ...opts,
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001/',
      },
    },
  ],
};

export default config;
