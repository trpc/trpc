import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 0)
const CDN_PORT = Number(process.env.E2E_CDN_PORT ?? 0)

const baseURL = `http://localhost:${APP_PORT}`
const transformMode = process.env.TRANSFORM_ASSETS_MODE || 'string'
const optionsKind =
  process.env.TRANSFORM_ASSETS_OPTIONS_KIND || 'createTransform'
const optionsCache = process.env.TRANSFORM_ASSETS_OPTIONS_CACHE || 'true'
const optionsWarmup = process.env.TRANSFORM_ASSETS_OPTIONS_WARMUP || 'true'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: [
    {
      // CDN server — serves built client assets on a separate port with CORS
      command: `node tests/cdn-server.mjs`,
      wait: {
        stdout:
          /CDN Server: (?<CDN_ORIGIN>http:\/\/localhost:(?<E2E_CDN_PORT>\d+))/,
      },
      reuseExistingServer: false,
      stdout: 'pipe',
      env: {
        CDN_PORT: String(CDN_PORT),
      },
    },
    {
      // App server — builds the project then starts the srvx server
      // with CDN_ORIGIN so that transformAssets rewrites manifest URLs
      command: `pnpm build && pnpm start`,
      wait: appServerReady,
      reuseExistingServer: false,
      stdout: 'pipe',
      env: {
        PORT: String(APP_PORT),
        TRANSFORM_ASSETS_MODE: transformMode,
        TRANSFORM_ASSETS_OPTIONS_KIND: optionsKind,
        TRANSFORM_ASSETS_OPTIONS_CACHE: optionsCache,
        TRANSFORM_ASSETS_OPTIONS_WARMUP: optionsWarmup,
      },
      timeout: 120_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
