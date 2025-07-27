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
  target: ['node18', 'es2017'],
  entry: input,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  // unbundle: true,
  format: ['cjs', 'esm'],
  outExtensions: (ctx) => ({
    dts: ctx.format === 'cjs' ? '.d.cts' : '.d.mts',
    js: ctx.format === 'cjs' ? '.cjs' : '.mjs',
  }),
  onSuccess: async () => {
    const start = Date.now();
    await generateEntrypoints(input);
    // eslint-disable-next-line no-console
    console.log(`Generated entrypoints in ${Date.now() - start}ms`);
  },
});
