import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { conditions: ['node', 'production'] },
  ssr: { noExternal: true },
  build: {
    ssr: true,
    outDir: './dist/server',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/server.tsx',
      formats: ['es'],
      fileName: () => 'server.js',
    },
    rolldownOptions: {
      platform: 'node',
      external: [/^node:/, /^react(?:\/|$)/, /^react-dom(?:\/|$)/],
    },
  },
})
