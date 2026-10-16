import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@benchmarks/ssr unit',
    environment: 'node',
    include: ['bench-utils.test.ts'],
  },
})
