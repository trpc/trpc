import { defineConfig } from 'tsdown';
import { generateEntrypoints } from '../../scripts/entrypoints';

export const input = [
  'src/index.ts',
  'src/links/httpBatchLink.ts',
  'src/links/httpLink.ts',
  'src/links/loggerLink.ts',
  'src/links/splitLink.ts',
  'src/links/wsLink/wsLink.ts',
  'src/unstable-internals.ts',
];

export default defineConfig({
  entry: input,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  unbundle: true,
  format: ['cjs', 'esm'],
  onSuccess: async () => {
    const start = Date.now();
    await generateEntrypoints(input);
    // eslint-disable-next-line no-console
    console.log(`Generated entrypoints in ${Date.now() - start}ms`);
  },
});
