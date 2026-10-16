import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'
const distDir = process.env.E2E_DIST_DIR ?? `dist-${toolchain}-ssr`

const serverEntryFile = toolchain === 'rsbuild' ? 'index.js' : 'server.js'
const startCommand = `pnpm exec srvx --prod --dir=. -s ${distDir}/client --entry ${distDir}/server/${serverEntryFile}`

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: { baseURL },
  webServer: {
    command: startCommand,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      E2E_DIST_DIR: distDir,
      NODE_ENV: 'production',
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
