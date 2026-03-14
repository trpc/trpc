import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      globalSetup: ['./test/scripts/globalSetup.ts'],

      // force a rerun of globalSetup whenever these files change under watch mode
      forceRerunTriggers: ['./test/routers/**/*.ts', './src/**/*.ts'],
    },
  }),
);
