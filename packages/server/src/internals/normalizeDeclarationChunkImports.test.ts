import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  getDeclarationOutputs,
  normalizeDeclarationChunkImports,
  normalizeServerDeclarationChunkImports,
} from './normalizeDeclarationChunkImports';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

async function createTempDistDir() {
  const dirPath = await mkdtemp(path.join(os.tmpdir(), 'trpc-dts-'));
  tempDirs.push(dirPath);
  return dirPath;
}

async function writeDistFile(
  distDir: string,
  relativePath: string,
  contents: string,
) {
  const filePath = path.join(distDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

async function readDistFile(distDir: string, relativePath: string) {
  return readFile(path.join(distDir, relativePath), 'utf8');
}

test('normalizeDeclarationChunkImports rewrites only unstable-core hashed imports', () => {
  const contents = [
    "export type { RootConfig } from './unstable-core-do-not-import.d-abc123.mjs';",
    "export type { Router } from '../unstable-core-do-not-import.d-def456.cjs';",
    "export type { Tracked } from './tracked.d-ghi789.mjs';",
  ].join('\n');

  expect(normalizeDeclarationChunkImports(contents)).toBe(
    [
      "export type { RootConfig } from './unstable-core-do-not-import.d.mts';",
      "export type { Router } from '../unstable-core-do-not-import.d.cts';",
      "export type { Tracked } from './tracked.d-ghi789.mjs';",
    ].join('\n'),
  );
});

test('getDeclarationOutputs excludes the unstable-core entrypoint', () => {
  expect(
    getDeclarationOutputs([
      'src/index.ts',
      'src/adapters/fetch/index.ts',
      'src/unstable-core-do-not-import.ts',
    ]),
  ).toEqual([
    'index.d.mts',
    'index.d.cts',
    'adapters/fetch/index.d.mts',
    'adapters/fetch/index.d.cts',
  ]);
});

test('normalizeServerDeclarationChunkImports rewrites public declaration outputs without touching unstable-core entrypoints', async () => {
  const distDir = await createTempDistDir();
  const rawInputs = [
    'src/index.ts',
    'src/adapters/fetch/index.ts',
    'src/unstable-core-do-not-import.ts',
  ];

  await writeDistFile(
    distDir,
    'index.d.mts',
    [
      "export type { RootConfig } from './unstable-core-do-not-import.d-abc123.mjs';",
      "export type { Tracked } from './tracked.d-def456.mjs';",
    ].join('\n'),
  );
  await writeDistFile(
    distDir,
    'index.d.cts',
    "export type { RootConfig } from './unstable-core-do-not-import.d-abc123.cjs';",
  );
  await writeDistFile(
    distDir,
    'adapters/fetch/index.d.mts',
    "export type { RootConfig } from '../../unstable-core-do-not-import.d-xyz789.mjs';",
  );
  await writeDistFile(
    distDir,
    'adapters/fetch/index.d.cts',
    "export type { RootConfig } from '../../unstable-core-do-not-import.d-xyz789.cjs';",
  );
  await writeDistFile(
    distDir,
    'unstable-core-do-not-import.d.mts',
    "export type { RootConfig } from './unstable-core-do-not-import.d-selfhash.mjs';",
  );

  await normalizeServerDeclarationChunkImports(rawInputs, distDir);

  await expect(readDistFile(distDir, 'index.d.mts')).resolves.toBe(
    [
      "export type { RootConfig } from './unstable-core-do-not-import.d.mts';",
      "export type { Tracked } from './tracked.d-def456.mjs';",
    ].join('\n'),
  );
  await expect(readDistFile(distDir, 'index.d.cts')).resolves.toBe(
    "export type { RootConfig } from './unstable-core-do-not-import.d.cts';",
  );
  await expect(
    readDistFile(distDir, 'adapters/fetch/index.d.mts'),
  ).resolves.toBe(
    "export type { RootConfig } from '../../unstable-core-do-not-import.d.mts';",
  );
  await expect(
    readDistFile(distDir, 'adapters/fetch/index.d.cts'),
  ).resolves.toBe(
    "export type { RootConfig } from '../../unstable-core-do-not-import.d.cts';",
  );
  await expect(
    readDistFile(distDir, 'unstable-core-do-not-import.d.mts'),
  ).resolves.toBe(
    "export type { RootConfig } from './unstable-core-do-not-import.d-selfhash.mjs';",
  );
});
