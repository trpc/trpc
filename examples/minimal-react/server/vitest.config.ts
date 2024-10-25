import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['typescript'], // resolve imports subpath to resolve source ts files
  },
});
