import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    pluginTailwindcss(),
    pluginReact(),
    tanstackStart({
      srcDirectory: 'src',
    }),
  ],
})
