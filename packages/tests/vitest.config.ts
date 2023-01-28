import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    setupFiles: ['./setupTests.ts'],
  },
});
