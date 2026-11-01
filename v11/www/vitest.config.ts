import { defineConfig } from 'vitest/config';

/** The site's own tests, without `vite.config.ts`'s content plugins. */
export default defineConfig({
  // `src/og/render.ts` inlines resvg's wasm.
  assetsInclude: ['**/*.wasm'],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'www',
    environment: 'node',
    include: ['build/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
