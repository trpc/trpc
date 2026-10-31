import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup } from '@testing-library/react';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
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

type Transformer = Parameters<typeof applyTransform>[0];
const snapshotTestTransform = async (file: string, transform: Transformer) => {
  const source = readFileSync(file, 'utf-8');

  const transformed = applyTransform(
    transform,
    { trpcImportName: 'trpc' },
    { source },
    {},
  );
  const formatted = await formatFile(file, transformed || source);

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

type FixtureLoaders = Record<string, () => Promise<unknown>>;

const fixtureModules: FixtureLoaders = {
  ...import.meta.glob('./__fixtures__/hooks/*.tsx'),
  ...import.meta.glob('./__fixtures__/provider/*.tsx'),
};

function importFixture<T>(globDir: string, name: string): Promise<T> {
  const key = `${globDir}/${name}`;
  const load = fixtureModules[key];
  if (!load) {
    throw new Error(`No fixture module registered for ${key}`);
  }
  return load() as Promise<T>;
}

async function executeTests(
  globDir: string,
  fixturesDir: string,
  file: string,
  transform: Transformer,
) {
  const fixtureFile = join(fixturesDir, file);

  // Load the spec which can be used to test both input and transformed components
  const specName = file.replace('.tsx', '.spec.tsx');
  const hasSpec = existsSync(join(fixturesDir, specName));

  // Check the input component runs if a spec is provided
  if (hasSpec) {
    const spec = await importFixture<SpecDefFile>(globDir, specName);

    const fixture = await importFixture<ComponentFile>(globDir, file);
    const fixtureComponents = Object.keys(fixture)
      .filter((key) => key.startsWith('Component'))
      .map((key) => [key, fixture[key]!] as const);
    for (const [name, Component] of fixtureComponents) {
      // eslint-disable-next-line no-console
      console.log(`Running spec on input for ${name}`);
      try {
        await spec.run(Component);
      } finally {
        cleanup();
      }
    }
  }

  await snapshotTestTransform(fixtureFile, transform);

  if (hasSpec) {
    const spec = await importFixture<SpecDefFile>(globDir, specName);

    const snapName = file.replace('.tsx', '.snap.tsx');
    const snapshotFile = join(fixturesDir, snapName);
    const snapshot = await importFixture<ComponentFile>(globDir, snapName);

    // We get the original fixture components because we expect them to be 1-1 and if not we'll throw
    const fixture = await importFixture<ComponentFile>(globDir, file);
    const fixtureComponents = Object.keys(fixture)
      .filter((key) => key.startsWith('Component'))
      .map((key) => [key, snapshot[key]] as const);

    for (const [name, Component] of fixtureComponents) {
      if (!Component) {
        expect.fail(
          `Snapshot file ${snapshotFile} does not export ${name}, this could indicate the transform didn't work or is a test harness problem`,
        );
      }

      // eslint-disable-next-line no-console
      console.log(`Running spec on output for ${name}`);
      try {
        await spec.run(Component);
      } finally {
        cleanup();
      }
    }
  }
}

describe('hooks', () => {
  const globDir = './__fixtures__/hooks';
  const fixturesDir = new URL(globDir, import.meta.url).pathname;

  const fixtures = readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('hooks %s', async (file) => {
    await executeTests(globDir, fixturesDir, file, hooksTransform);
  });
});

describe('provider', () => {
  const globDir = './__fixtures__/provider';
  const fixturesDir = new URL(globDir, import.meta.url).pathname;

  const fixtures = readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('provider %s', async (file) => {
    await executeTests(globDir, fixturesDir, file, providerTransform);
  });
});
