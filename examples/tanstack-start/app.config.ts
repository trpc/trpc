import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from '@tanstack/start/config';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: () => [
      tailwindcss() as any,
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
});
