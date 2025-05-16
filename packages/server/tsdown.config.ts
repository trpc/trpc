import { defineConfig } from 'tsdown';

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
  },
  // outExtensions: ({ format }) => ({
  //   js: format === 'es' ? '.mjs' : '.cjs',
  //   dts: format === 'cjs' ? '.mts' : '.cts',
  // }),
  format: ['cjs', 'esm'],
});
