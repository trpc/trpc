import { defineConfig } from 'tsdown';
import { generateEntrypoints } from '../../scripts/entrypoints';

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
  unbundle: true,
  format: ['cjs', 'esm'],
  onSuccess: async () => {
    const start = Date.now();
    await generateEntrypoints(input)
    // eslint-disable-next-line no-console
    console.log(`Generated entrypoints in ${Date.now() - start}ms`);
  }
});
