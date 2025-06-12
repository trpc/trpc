import { defineConfig } from 'tsdown/config';

export default defineConfig({
  dts: { sourcemap: true },
  outDir: 'dist',
  clean: false,
  outExtensions: () => ({ dts: '.d.ts' }),
});
