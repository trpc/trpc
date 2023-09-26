import { fileURLToPath } from 'url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, '**/playwright/**'],
    alias: {
      '~/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
});
