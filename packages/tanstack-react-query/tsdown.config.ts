import { defineConfig } from 'tsdown';

export const input = ['src/index.ts'];

export default defineConfig({
  entry: input,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  unbundle: true,
  format: ['cjs', 'esm'],
});
