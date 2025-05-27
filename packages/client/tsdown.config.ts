import { defineConfig } from 'tsdown';

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
  format: ['cjs', 'esm'],
});
