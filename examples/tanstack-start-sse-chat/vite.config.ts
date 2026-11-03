import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig((env) => ({
  plugins: [tailwindcss(), tanstackStart(), nitro(), react()],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // `@shared/ui` is injected into `node_modules` as TypeScript source, so Vite
    // neither prebundles it nor discovers its dependencies. Base UI pulls in
    // CommonJS (`use-sync-external-store`) that only works prebundled.
    include: [
      'avatar',
      'button',
      'dialog',
      'input',
      'merge-props',
      'separator',
      'use-render',
    ].map((entry) => `@shared/ui > @base-ui/react/${entry}`),
  },
  ssr:
    env.command === 'build'
      ? // Nitro's server bundle can't follow the `require()`s Vite leaves for
        // external CommonJS dependencies, and there is no `node_modules` on Vercel
        { noExternal: true }
      : // `@shared/ui` is TypeScript source, so Node can't load it as an external
        { noExternal: ['@shared/ui'] },
}));
