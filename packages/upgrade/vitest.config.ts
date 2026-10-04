import { mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.shared.ts';

export default mergeConfig(baseConfig, {
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    exclude: ['test/__fixtures__/*/*.spec.ts*', 'node_modules'],
    setupFiles: ['./test/setupTests.ts'],
  },
});
