import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul', // @cloudflare/vitest-pool-workers does not support v8 provider,
      include: ['./src/**'],
      exclude: ['**.test-d.*', '**.test.*'],
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
})
