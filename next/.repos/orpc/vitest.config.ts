import process from 'node:process'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { loadEnv } from 'vite'
import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ''),
    coverage: {
      include: ['packages/*/src/**'],
      exclude: [
        '**.bench.*',
        '**.test-d.*',
        '**.test.*',
        './packages/bun/**',
        './packages/cloudflare/**',
      ],
    },
    projects: [
      {
        plugins: [codspeedPlugin()],
        test: {
          globals: true,
          exclude: ['**/**'],
          benchmark: {
            include: ['**/*.bench.ts'],
            exclude: [...defaultExclude, '**/.claude/**'],
          },
        },
      },
      {
        test: {
          globals: true,
          setupFiles: ['./vitest.javascript.ts'],
          include: ['**/*.test.ts'],
          exclude: [
            ...defaultExclude,
            '**/.claude/**',
            './packages/bun/**',
            './packages/cloudflare/**',
            // MSW v3 requires Node.js 22+, older versions only run the MSW v2 project below
            ...(Number.parseInt(process.versions.node) < 22 ? ['./packages/msw/**'] : []),
          ],
          benchmark: {
            exclude: ['**/**'],
          },
        },
      },
      {
        // also test @orpc/experimental-msw against MSW v2
        resolve: {
          alias: { msw: 'msw-v2' },
        },
        test: {
          name: 'msw-v2',
          globals: true,
          setupFiles: ['./vitest.javascript.ts'],
          include: ['./packages/msw/**/*.test.ts'],
          benchmark: {
            exclude: ['**/**'],
          },
        },
      },
      {
        test: {
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./vitest.javascript.ts', './vitest.jsdom.ts'],
          include: [
            './packages/next/**/*.test.tsx',
            './packages/tanstack-query/**/*.test.tsx',
            './packages/pinia-colada/**/*.test.tsx',
            './packages/swr/**/*.test.tsx',
          ],
          benchmark: {
            exclude: ['**/**'],
          },
        },
      },
    ],
  },
}))
