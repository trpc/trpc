import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import codspeedPlugin from '@codspeed/vitest-plugin'
import type { UserConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export function createLinkPerformanceConfig(
  target: 'client' | 'ssr',
): UserConfig {
  const server = target === 'ssr'

  return {
    root,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [
      !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
        codspeedPlugin(),
      react(),
    ],
    resolve: {
      conditions: [server ? 'node' : 'browser', 'production'],
    },
    ssr: {
      noExternal: process.env.VITEST ? undefined : true,
      resolve: {
        conditions: ['node', 'production'],
      },
    },
    build: {
      outDir: `./dist/${target}`,
      emptyOutDir: true,
      minify: false,
      ssr: server,
      lib: {
        entry: `${root}src/${target}.tsx`,
        formats: ['es'],
        fileName: 'app',
      },
      rolldownOptions: {
        platform: 'node',
        external: [
          'node:module',
          'module',
          /^react(?:\/|$)/,
          /^react-dom(?:\/|$)/,
        ],
        output: { entryFileNames: 'app.js' },
      },
    },
    test: {
      name: `react-link-performance-${target}`,
      watch: false,
      environment: server ? 'node' : 'jsdom',
      setupFiles: server ? [] : ['../vitest.setup.ts'],
      server: {
        deps: {
          external: [/\/link-performance\/dist\//],
        },
      },
      include: [],
      benchmark: {
        include: [`${target}.bench.ts`],
      },
    },
  }
}
