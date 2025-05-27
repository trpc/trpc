import { defineConfig } from 'tsdown';

export const input = [
  'src/index.ts',
  'src/app-dir/server.ts',
  'src/app-dir/client.ts',
  'src/app-dir/links/nextCache.ts',
  'src/app-dir/links/nextHttp.ts',
  'src/ssrPrepass.ts',
];

export default defineConfig({
  entry: input,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  format: ['cjs', 'esm'],
});
