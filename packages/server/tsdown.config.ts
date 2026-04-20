import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

const UNSTABLE_CORE_ENTRYPOINT = 'src/unstable-core-do-not-import.ts';

const UNSTABLE_CORE_CHUNK_IMPORT =
  /((?:\.\.\/|\.\/)+unstable-core-do-not-import)\.d-[A-Za-z0-9_-]+\.(mjs|cjs)/g;

function normalizeDeclarationChunkImports(contents: string) {
  return contents.replace(
    UNSTABLE_CORE_CHUNK_IMPORT,
    (_, importPath: string, format: 'mjs' | 'cjs') =>
      `${importPath}.d.${format === 'mjs' ? 'mts' : 'cts'}`,
  );
}

function getDeclarationOutputs(rawInputs: string[]) {
  return rawInputs
    .filter((entrypoint) => entrypoint !== UNSTABLE_CORE_ENTRYPOINT)
    .flatMap((entrypoint) => {
      const distBase = entrypoint
        .split('/')
        .slice(1)
        .join('/')
        .replace(/\.(ts|tsx)$/, '');

      return [`${distBase}.d.mts`, `${distBase}.d.cts`];
    });
}

async function normalizeServerDeclarationChunkImports(rawInputs: string[]) {
  const declarationOutputs = getDeclarationOutputs(rawInputs);

  await Promise.all(
    declarationOutputs.map(async (relativePath) => {
      const filePath = path.resolve('dist', relativePath);
      const original = await readFile(filePath, 'utf8');
      const normalized = normalizeDeclarationChunkImports(original);

      if (normalized !== original) {
        await writeFile(filePath, normalized, 'utf8');
      }
    }),
  );
}

export default defineConfig({
  target: ['node18', 'es2017'],
  entry: input,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.build.json',
  },
  // unbundle: true,
  format: ['cjs', 'esm'],
  outExtensions: (ctx) => ({
    dts: ctx.format === 'cjs' ? '.d.cts' : '.d.mts',
    js: ctx.format === 'cjs' ? '.cjs' : '.mjs',
  }),
  onSuccess: async () => {
    const start = Date.now();
    const { generateEntrypoints } = await import(
      '../../scripts/entrypoints.js'
    );
    await generateEntrypoints(input);
    await normalizeServerDeclarationChunkImports(input);
    // eslint-disable-next-line no-console
    console.log(`Generated entrypoints in ${Date.now() - start}ms`);
  },
});
