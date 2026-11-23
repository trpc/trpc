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
  target: ['node18', 'es2017'],
  entry: input,
  deps: {
    neverBundle: [
      /^aws-lambda$/,
      /^express$/,
      /^fastify$/,
      /^@fastify\//,
      /^next(\/|$)/,
      /^ws$/,
    ],
  },
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  // unbundle: true,
  footer: ({ fileName }) => {
    // The shared declarations end up in a hashed chunk which is not part of
    // the package's `exports`. Make that chunk load the public
    // `unstable-core-do-not-import` entrypoint so TypeScript can always name
    // inferred types through `@trpc/server/unstable-core-do-not-import`
    // instead of reporting TS2742/TS2883 (or, with `baseUrl`, silently emitting
    // a `node_modules/@trpc/server/dist/...` path).
    // https://github.com/trpc/trpc/issues/6998
    const match = /^unstable-core-do-not-import-.+\.d\.(mts|cts)$/.exec(
      fileName,
    );
    if (!match) return undefined;
    const ext = match[1] === 'mts' ? 'mjs' : 'cjs';
    return `import './unstable-core-do-not-import.${ext}';`;
  },
  format: ['cjs', 'esm'],
  outExtensions: (ctx) => ({
    dts: ctx.format === 'cjs' ? '.d.cts' : '.d.mts',
    js: ctx.format === 'cjs' ? '.cjs' : '.mjs',
  }),
  onSuccess: async () => {
    const start = Date.now();
    const { generateEntrypoints } =
      await import('../../scripts/entrypoints.js');
    await generateEntrypoints(input);
    // oxlint-disable-next-line no-console
    console.log(`Generated entrypoints in ${Date.now() - start}ms`);
  },
});
