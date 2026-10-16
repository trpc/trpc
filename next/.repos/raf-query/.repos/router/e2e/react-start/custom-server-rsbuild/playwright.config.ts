import { defineConfig, devices } from '@playwright/test'

const mode = process.env.MODE ?? 'prod'
const isDev = mode === 'dev'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: { baseURL },
  webServer: {
    command: isDev ? 'pnpm dev:e2e' : 'pnpm build && pnpm start',
    wait: { stdout: /E2E app: http:\/\/localhost:(?<E2E_APP_PORT>\d+)/ },
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
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
