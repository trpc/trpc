import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from '@tanstack/start/config';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: () => [
      tailwindcss() as never,
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
});
