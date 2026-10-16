import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3110', browserName: 'chromium' },
  webServer: {
    command:
      process.env.QUERY_EXAMPLE_PRODUCTION === '1'
        ? 'PORT=3110 pnpm start'
        : 'pnpm dev --port 3110',
    url: 'http://localhost:3110/preferences',
    timeout: 120_000,
  },
})
