import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'
import { isErrorMode } from './tests/utils/isErrorMode'
import { getViolationArtifactName } from './tests/violations.utils'

const viteBundledDev = process.env.E2E_VITE_BUNDLED_DEV === 'true'

const distDir = process.env.E2E_DIST_DIR ?? 'dist'
const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
const violationArtifacts = [
  getViolationArtifactName('build'),
  getViolationArtifactName('dev'),
  getViolationArtifactName('dev.cold'),
  getViolationArtifactName('dev.warm'),
].join(' ')

console.log('running in error mode:', isErrorMode.toString())

export default defineConfig({
  testDir: './tests',
  workers: 1,

  globalSetup: isErrorMode
    ? './tests/error-mode.setup.ts'
    : './tests/violations.setup.ts',

  reporter: [['line']],

  use: {
    baseURL,
  },

  // In error mode the build intentionally fails, so there is no server to
  // start.  We skip the webServer entirely and only run error-mode.spec.ts.
  ...(isErrorMode
    ? {}
    : {
        webServer: {
          command: `rm -f webserver-dev.log ${violationArtifacts} && PORT=${PORT} VITE_SERVER_PORT=${PORT} pnpm start`,
          wait: appServerReady,
          reuseExistingServer: false,
          stdout: 'pipe',
          cwd: import.meta.dirname,
          env: {
            PORT: String(PORT),
            VITE_SERVER_PORT: String(PORT),
            E2E_DIST_DIR: distDir,
            E2E_VITE_BUNDLED_DEV: String(viteBundledDev),
          },
        },
      }),

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: isErrorMode
        ? 'error-mode.spec.ts'
        : 'import-protection.spec.ts',
    },
  ],
})
