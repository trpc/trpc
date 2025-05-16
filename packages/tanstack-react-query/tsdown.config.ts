import { defineConfig } from 'tsdown';

export const input = ['src/index.ts'];

export default defineConfig({
  entry: input,
  dts: {
    sourcemap: true,
  },
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.mjs' : '.cjs',
    dts: format === 'cjs' ? '.mts' : '.cts',
  }),
  format: ['cjs', 'esm'],
});
