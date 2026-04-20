import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UNSTABLE_CORE_CHUNK_IMPORT =
  /((?:\.\.\/|\.\/)+unstable-core-do-not-import)\.d-[A-Za-z0-9_-]+\.(mjs|cjs)/g;

export function normalizeDeclarationChunkImports(contents: string) {
  return contents.replace(
    UNSTABLE_CORE_CHUNK_IMPORT,
    (_, importPath: string, format: 'mjs' | 'cjs') =>
      `${importPath}.d.${format === 'mjs' ? 'mts' : 'cts'}`,
  );
}

function getDeclarationOutputs(rawInputs: string[]) {
  return rawInputs.flatMap((input) => {
    const distBase = input
      .split('/')
      .slice(1)
      .join('/')
      .replace(/\.(ts|tsx)$/, '');

    return [`${distBase}.d.mts`, `${distBase}.d.cts`];
  });
}

export async function normalizeServerDeclarationChunkImports(
  rawInputs: string[],
) {
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
