import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { cpuSimulationExecArgv } from '../../../../cpu-simulation'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    react(),
  ],
  resolve: { conditions: ['browser', 'production'] },
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
    name: '@benchmarks/client-nav hydration (react)',
    watch: false,
    environment: 'node',
    isolate: true,
    include: ['hydration.test.ts'],
    benchmark: { include: ['speed.bench.ts'] },
  },
})
