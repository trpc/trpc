import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/vue-start/plugin/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  experimental:
    process.env.E2E_VITE_BUNDLED_DEV === 'true'
      ? { bundledDev: true }
      : undefined,
  server: { port: 3000 },
  plugins: [tanstackStart(), vue(), vueJsx()],
})
