import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../',
  test: {
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    setupFiles: ['./tests/setupTests.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['./*/src/**/*.{ts,tsx,js,jsx}', '!**/deprecated/**'],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@trpc\/server\/src(.*)/,
        replacement: join(__dirname, '../server/src$1'),
      },
      {
        find: /^@trpc\/client\/src(.*)/,
        replacement: join(__dirname, '../client/src$1'),
      },
      {
        find: /^@trpc\/react-query\/src(.*)/,
        replacement: join(__dirname, '../react-query/src$1'),
      },
      {
        find: /^@trpc\/next\/src(.*)/,
        replacement: join(__dirname, '../next/src$1'),
      },
    ],
  },
});
