import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { cpuSimulationExecArgv } from '../../../../cpu-simulation'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    // The Node worker evaluates the prebuilt bundle and needs no JSX transform
    // or browser test setup injected by vite-plugin-solid.
    !process.env.VITEST && solid({ ssr: true, hot: false, dev: false }),
  ],
  resolve: { conditions: ['solid', 'browser', 'production'] },
  build: {
    outDir: './dist/client',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/client.tsx',
      name: 'HydrationBenchmark',
      formats: ['iife'],
      fileName: () => 'client.js',
    },
  },
  test: {
    execArgv: cpuSimulationExecArgv(),
    name: '@benchmarks/client-nav hydration (solid)',
    watch: false,
    environment: 'node',
    isolate: true,
    include: ['hydration.test.ts'],
    benchmark: { include: ['speed.bench.ts'] },
  },
})
