import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  //   root: '../',
  clearScreen: false,

  test: {
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    // include: ['tests/**/*.{browser}.test.{ts,js}'],
    setupFiles: ['./setupTests.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/deprecated/**'],
    },
    useAtomics: !!process.env['CI'],
  },
  resolve: {
    alias: {
      '@trpc/server/src/': join(__dirname, 'packages/server/src/'),
      '@trpc/client/src/': join(__dirname, 'packages/client/src/'),
      '@trpc/react-query/src/': join(__dirname, 'packages/react-query/src/'),
      '@trpc/next/src/': join(__dirname, 'packages/next/src/'),
      'vitest-environment-miniflare': join(
        __dirname,
        'node_modules/vitest-environment-miniflare',
      ),
      '@vitest/coverage-istanbul': join(
        __dirname,
        'node_modules/@vitest/coverage-istanbul',
      ),
    },
  },
});
