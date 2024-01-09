import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../',
  clearScreen: false,
  test: {
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    setupFiles: ['./tests/setupTests.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['*/src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/deprecated/**'],
    },
    useAtomics: !!process.env['CI'],
  },
  resolve: {
    alias: {
      // in windows, "path.join" uses backslashes, it leads escape characters
      '@trpc/server/src/': [__dirname, '../server/src/'].join('/'),
      '@trpc/client/src/': [__dirname, '../client/src/'].join('/'),
      '@trpc/react-query/src/': [__dirname, '../react-query/src/'].join('/'),
      '@trpc/next/src/': [__dirname, '../next/src/'].join('/'),
      'vitest-environment-miniflare': [
        __dirname,
        'node_modules/vitest-environment-miniflare',
      ].join('/'),
      '@vitest/coverage-istanbul': [
        __dirname,
        'node_modules/@vitest/coverage-istanbul',
      ].join('/'),
    },
  },
});
