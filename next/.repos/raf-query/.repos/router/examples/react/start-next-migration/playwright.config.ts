import { defineConfig } from '@playwright/test'

const production = process.env.MIGRATION_PRODUCTION === '1'
const env = {
  SESSION_PASSWORD: 'migration-reference-test-secret-at-least-32-characters',
  DEMO_PASSWORD: 'migration-test-password',
}

export default defineConfig({
  testDir: './tests',
  use: { browserName: 'chromium' },
  projects: [
    { name: 'next', use: { baseURL: 'http://localhost:3100' } },
    { name: 'start', use: { baseURL: 'http://localhost:3101' } },
  ],
  webServer: [
    {
      command: production ? 'pnpm start:next' : 'pnpm dev:next',
      url: 'http://localhost:3100',
      env,
      timeout: 120_000,
    },
    {
      command: production ? 'PORT=3101 pnpm start' : 'pnpm dev',
      url: 'http://localhost:3101',
      env,
      timeout: 120_000,
    },
  ],
})
