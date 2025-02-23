import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe } from 'node:test';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import * as hooksTransform from '../src/transforms/hooksToOptions';
import * as providerTransform from '../src/transforms/provider';
import type { ComponentFile, SpecDefFile } from './specDef';

const formatFile = async (path: string, source: string) => {
  const prettierConfig = await resolveConfig(path);
  return format(source, {
    ...prettierConfig,
    parser: 'typescript',
  });
};

const snapshotTestTransform = async (file: string, transform: any) => {
  const source = readFileSync(file, 'utf-8');

  const transformed = applyTransform(
    transform,
    { trpcImportName: 'trpc' },
    { source },
    {},
  );
  const formatted = await formatFile(file, transformed);

  await expect(formatted).toMatchFileSnapshot(
    file.replace('.tsx', '.snap.tsx'),
  );
};

function isFixture(file: string) {
  return (
    !file.endsWith('.snap.tsx') &&
    !file.endsWith('.spec.tsx') &&
    !file.endsWith('.trpc.tsx')
  );
}

async function executeTests(fixturesDir: string, file: string, transform: any) {
  const fixtureFile = join(fixturesDir, file);

  const specFile = fixtureFile.replace('.tsx', '.spec.tsx');
  if (!existsSync(specFile)) {
    expect.fail(`There is no .spec.ts file at ${specFile}`);
  }

  const spec = (await import(specFile)) as SpecDefFile;

  const fixture = (await import(fixtureFile)) as ComponentFile;
  await spec.run(fixture.Component);

  await snapshotTestTransform(fixtureFile, transform);

  // const snapshotFile = join(fixturesDir, file.replace('.tsx', '.snap.tsx'));
  // const snapshot = (await import(snapshotFile)) as ComponentFile;
  // if (typeof snapshot.Component === 'undefined') {
  //   expect.fail(`Snapshot file ${snapshotFile} does not export Component`);
  // }

  // await spec.run(snapshot.Component);
}

describe('hooks', () => {
  const literal = './__fixtures__/hooks'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const ONLY_RUN: string[] = [];

  const fixtures = ONLY_RUN.length
    ? ONLY_RUN
    : readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('hooks %s', async (file) => {
    await executeTests(fixturesDir, file, hooksTransform);
  });
});

describe('provider', () => {
  const literal = './__fixtures__/provider'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const ONLY_RUN: string[] = [];

  const fixtures = ONLY_RUN.length
    ? ONLY_RUN
    : readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('provider %s', async (file) => {
    await executeTests(fixturesDir, file, providerTransform);
  });
});
