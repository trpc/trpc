import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
const mode = process.env.MODE ?? 'prod'
const isDev = mode === 'dev'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  globalSetup: './tests/setup/global.setup.ts',
  use: { baseURL },
  webServer: {
    command: isDev ? 'pnpm dev:e2e --port 0' : 'pnpm build && pnpm start',
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      VITE_NODE_ENV: 'test',
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(PORT),
      VITE_SERVER_PORT: String(PORT),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
