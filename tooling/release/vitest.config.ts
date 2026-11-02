import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.shared.ts';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      name: 'release',
      environment: 'node',
    },
  }),
);
