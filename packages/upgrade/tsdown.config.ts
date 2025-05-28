import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      bin: './src/bin/index.ts',
    },
    format: 'es',
  },
  {
    entry: {
      'transforms/hooksToOptions': './src/transforms/hooksToOptions.ts',
      'transforms/provider': './src/transforms/provider.ts',
    },
    format: 'cjs',
  },
]);
