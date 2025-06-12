import { defineConfig } from 'tsdown/config';

export default defineConfig({
  entry: ['src/client.ts', 'src/server.ts'],
  dts: { sourcemap: true },
  outDir: 'dist',
  clean: false,
});
