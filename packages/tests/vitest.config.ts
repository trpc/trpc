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
      all: true,
      include: ['./*/src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/deprecated/**'],
    },
  },
  resolve: {
    alias: {
      '@trpc/server/src/': join(__dirname, '../server/src/'),
      '@trpc/client/src/': join(__dirname, '../client/src/'),
      '@trpc/react-query/src/': join(__dirname, '../react-query/src/'),
      '@trpc/next/src/': join(__dirname, '../next/src/'),
    },
  },
});
