import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [solid({ ssr: true, hot: false, dev: false })],
  resolve: { conditions: ['solid', 'node', 'production'] },
  ssr: {
    noExternal: true,
    resolve: { conditions: ['solid', 'node', 'production'] },
  },
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
      external: [/^node:/],
    },
  },
})
