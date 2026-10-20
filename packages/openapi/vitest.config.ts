import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.shared.ts';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      globalSetup: ['./test/scripts/globalSetup.ts'],

      // force a rerun of globalSetup whenever these files change under watch mode
      forceRerunTriggers: [
        './test/routers/**/*.router.ts',
        './src/**/*.ts',
        './package.json',
      ],
    },
  }),
);
