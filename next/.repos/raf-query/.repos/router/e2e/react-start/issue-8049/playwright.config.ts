import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT =
  Number(process.env.VITE_SERVER_PORT) || Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: { baseURL },
  webServer: {
    command: `VITE_SERVER_PORT=${PORT} pnpm dev:e2e --port ${PORT}`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
