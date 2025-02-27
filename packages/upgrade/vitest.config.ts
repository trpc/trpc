import { mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

export default mergeConfig(baseConfig, {
  test: {
    exclude: ['test/__fixtures__/*/*.spec.ts*', 'node_modules'],
    setupFiles: ['./test/setupTests.ts'],
  },
});
