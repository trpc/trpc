import { defineConfig } from 'tsdown/config';

export default defineConfig({
  entry: ['src/client.ts', 'src/server.ts'],
  dts: { sourcemap: true, emitDtsOnly: true },
  outDir: 'dist',
  clean: true,
});
