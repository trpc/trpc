import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from '@tanstack/start/config';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  deployment: {
    // https://tanstack.com/router/v1/docs/framework/react/start/hosting
    preset: 'node-server',
  },
  vite: {
    plugins: () => [
      tailwindcss() as never,
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
});
