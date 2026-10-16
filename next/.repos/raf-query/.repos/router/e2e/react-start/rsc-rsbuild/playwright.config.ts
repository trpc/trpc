import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const distDir = process.env.E2E_DIST_DIR ?? 'dist'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: 'pnpm start',
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      E2E_DIST_DIR: distDir,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
