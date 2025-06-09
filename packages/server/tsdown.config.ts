import { defineConfig } from 'tsdown';
import { generateEntrypoints } from '../../scripts/entrypoints';

export const input = [
  'src/adapters/aws-lambda/index.ts',
  'src/adapters/express.ts',
  'src/adapters/fastify/index.ts',
  'src/adapters/fetch/index.ts',
  'src/adapters/next-app-dir.ts',
  'src/adapters/next.ts',
  'src/adapters/node-http/index.ts',
  'src/adapters/standalone.ts',
  'src/adapters/ws.ts',
  'src/http.ts',
  'src/index.ts',
  'src/observable/index.ts',
  'src/rpc.ts',
  'src/shared.ts',
  'src/unstable-core-do-not-import.ts',
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
