import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      bin: './src/bin/index.ts',
    },
    format: 'es',
    // `npx @trpc/upgrade` runs on the user's Node; 22 can't parse `using`
    target: 'node20',
  },
  {
    entry: {
      'transforms/hooksToOptions': './src/transforms/hooksToOptions.ts',
      'transforms/provider': './src/transforms/provider.ts',
    },
    format: 'cjs',
    target: 'node20',
  },
]);
