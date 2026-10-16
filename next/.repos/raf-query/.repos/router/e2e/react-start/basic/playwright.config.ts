import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const mode = process.env.MODE ?? 'ssr'
const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'

const distDir = process.env.E2E_DIST_DIR ?? 'dist'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
const previewCommand =
  toolchain === 'rsbuild'
    ? `pnpm preview:rsbuild --host 0.0.0.0 --port ${PORT}`
    : `pnpm preview --host 0.0.0.0 --outDir ${distDir} --port ${PORT}`
const commandByMode = mode === 'preview' ? previewCommand : 'pnpm start'
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
    command: commandByMode,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=@tanstack/router-e2e-utils/mock-api`,
      MODE: mode,
      E2E_TOOLCHAIN: toolchain,
      START_PORT: '0',
      PORT: String(PORT),
      E2E_DIST_DIR: distDir,
      ...(process.env.TSS_RSB_CLIENT_OUTPUT
        ? { TSS_RSB_CLIENT_OUTPUT: process.env.TSS_RSB_CLIENT_OUTPUT }
        : {}),
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
