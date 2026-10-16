import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const mode = process.env.MODE ?? 'prod'
const isDev = mode === 'dev'
const viteConfig = process.env.VITE_CONFIG // 'nitro' | 'basepath' | 'cloudflare' | undefined
const PORT = Number(process.env.E2E_APP_PORT ?? 0)

// When using basepath config, the app is served at /my-app
const basePath = viteConfig === 'basepath' ? '/my-app' : ''
const baseURL = `http://localhost:${PORT}${basePath}`

// Select the appropriate dev command based on VITE_CONFIG
const devCommand = viteConfig
  ? `pnpm dev:e2e:${viteConfig}`
  : 'pnpm dev:e2e --port 0'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',

  use: {
    baseURL,
  },

  webServer: {
    command: isDev ? devCommand : `pnpm build && PORT=${PORT} pnpm start`,
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
