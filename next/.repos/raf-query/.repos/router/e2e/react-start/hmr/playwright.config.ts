import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'

const distDir = process.env.E2E_DIST_DIR ?? 'dist'
const viteBundledDev = process.env.E2E_VITE_BUNDLED_DEV === 'true'
const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
const devCommand =
  toolchain === 'rsbuild' ? 'pnpm dev:rsbuild' : 'pnpm dev:vite'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',

  use: {
    baseURL,
  },

  webServer: {
    command: `${devCommand} --port ${PORT}`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      VITE_NODE_ENV: 'test',
      PORT: String(PORT),
      E2E_TOOLCHAIN: toolchain,
      E2E_DIST_DIR: distDir,
      E2E_VITE_BUNDLED_DEV: String(viteBundledDev),
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
