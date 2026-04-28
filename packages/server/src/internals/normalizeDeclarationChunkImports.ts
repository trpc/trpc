import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const UNSTABLE_CORE_ENTRYPOINT = 'src/unstable-core-do-not-import.ts';

const UNSTABLE_CORE_CHUNK_IMPORT =
  /((?:\.\.\/|\.\/)+unstable-core-do-not-import)\.d-[A-Za-z0-9_-]+\.(mjs|cjs)/g;

/**
 * Rewrites hashed unstable-core declaration chunk imports to stable public
 * declaration entrypoints.
 */
export function normalizeDeclarationChunkImports(contents: string) {
  return contents.replace(
    UNSTABLE_CORE_CHUNK_IMPORT,
    (_, importPath: string, format: 'mjs' | 'cjs') =>
      `${importPath}.d.${format === 'mjs' ? 'mts' : 'cts'}`,
  );
}

/**
 * Lists the public declaration files emitted for the configured server inputs.
 */
export function getDeclarationOutputs(rawInputs: string[]) {
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

/**
 * Normalizes unstable-core declaration imports inside generated public
 * declaration entrypoints.
 */
export async function normalizeServerDeclarationChunkImports(
  rawInputs: string[],
  distDir = 'dist',
) {
  const declarationOutputs = getDeclarationOutputs(rawInputs);

  await Promise.all(
    declarationOutputs.map(async (relativePath) => {
      const filePath = path.resolve(distDir, relativePath);
      const original = await readFile(filePath, 'utf8');
      const normalized = normalizeDeclarationChunkImports(original);

      if (normalized !== original) {
        await writeFile(filePath, normalized, 'utf8');
      }
    }),
  );
}
