import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `https://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
    ignoreHTTPSErrors: true,
  },

  webServer: {
    command: `pnpm build && pnpm start`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    ignoreHTTPSErrors: true,
    env: {
      PORT: String(PORT),
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
