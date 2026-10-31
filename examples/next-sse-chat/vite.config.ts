import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig((env) => ({
  plugins: [tanstackStart(), nitro(), react()],
  resolve: {
    tsconfigPaths: true,
    // In this monorepo, the linked `@trpc/tanstack-react-query` would otherwise get its own copy
    dedupe: ['@tanstack/react-query'],
  },
  // Nitro's server bundle can't follow the `require()`s Vite leaves for
  // external CommonJS dependencies, and there is no `node_modules` on Vercel
  ssr: env.command === 'build' ? { noExternal: true } : {},
}));
