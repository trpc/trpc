import { defineConfig, devices } from '@playwright/test'
import {
  appServerReady,
  appServerReadyPattern,
} from '@tanstack/router-e2e-utils'
import { devPort } from './dev-server'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: [
    {
      command: `VITE_SERVER_PORT=${PORT} pnpm build && NODE_ENV=production PORT=${PORT} VITE_SERVER_PORT=${PORT} pnpm start`,
      wait: appServerReady,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `NODE_ENV=development VITE_SERVER_PORT=${devPort} pnpm dev:e2e --host localhost --port ${devPort} --strictPort`,
      wait: {
        stdout: new RegExp(
          appServerReadyPattern.source.replace('E2E_APP_PORT', 'E2E_DEV_PORT'),
        ),
      },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 90_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
