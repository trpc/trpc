import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
const command = `pnpm build && pnpm preview --port ${PORT}`

console.info('Running with mode: ', process.env.MODE || 'default')

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

  webServer: {
    command,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      MODE: process.env.MODE || '',
      VITE_MODE: process.env.MODE || '',
      PORT: String(PORT),
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
