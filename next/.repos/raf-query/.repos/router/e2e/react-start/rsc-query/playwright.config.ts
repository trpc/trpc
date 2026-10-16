import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

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
    // RSC production builds are not yet supported, use dev mode
    command: `pnpm dev:e2e --port 0`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      VITE_NODE_ENV: 'test',
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
