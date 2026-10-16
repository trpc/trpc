import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const distDir = process.env.E2E_DIST_DIR ?? 'dist'

export const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: /rsbuild-cache\.spec\.ts/,
  workers: 1,

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: {
    command: `PORT=${PORT} VITE_SERVER_PORT=${PORT} pnpm start`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      VITE_SERVER_PORT: String(PORT),
      E2E_DIST_DIR: distDir,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
