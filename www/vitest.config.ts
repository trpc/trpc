import { defineConfig } from 'vitest/config';

/** The site's own tests, without `vite.config.ts`'s content plugins. */
export default defineConfig({
  // `src/og/render.ts` inlines resvg's wasm.
  assetsInclude: ['**/*.wasm'],
  // The workspace has a vitest per set of its optional peers, and pnpm links
  // `@effect/vitest` to one of them: bundled, its `vitest` is the runner's.
  resolve: { dedupe: ['vitest'], tsconfigPaths: true },
  test: {
    name: 'www',
    environment: 'node',
    include: ['build/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
});
