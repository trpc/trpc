import { defineConfig } from 'vitest/config';

/** The site's own tests, without `vite.config.ts`'s content plugins. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: 'www',
    environment: 'node',
    include: ['build/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
