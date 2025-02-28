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

async function executeTests(
  fixturesDir: string,
  file: string,
  transform: Transformer,
) {
  const fixtureFile = join(fixturesDir, file);

  // Load the spec which can be used to test both input and transformed components
  const specFile = fixtureFile.replace('.tsx', '.spec.tsx');
  const hasSpec = existsSync(specFile);

  // Check the input component runs if a spec is provided
  if (hasSpec) {
    const spec = (await import(specFile)) as SpecDefFile;

    const fixture = (await import(fixtureFile)) as ComponentFile;
    const fixtureComponents = Object.keys(fixture)
      .filter((key) => key.startsWith('Component'))
      .map((key) => [key, fixture[key]!] as const);
    for (const [name, Component] of fixtureComponents) {
      // eslint-disable-next-line no-console
      console.log(`Running spec on input for ${name}`);
      await spec.run(Component);
    }
  }

  await snapshotTestTransform(fixtureFile, transform);

  if (hasSpec) {
    const spec = (await import(specFile)) as SpecDefFile;

    const snapshotFile = join(fixturesDir, file.replace('.tsx', '.snap.tsx'));
    const snapshot = (await import(snapshotFile)) as ComponentFile;

    // We get the original fixture components because we expect them to be 1-1 and if not we'll throw
    const fixture = (await import(fixtureFile)) as ComponentFile;
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
      await spec.run(Component);
    }
  }
}

describe('hooks', () => {
  const literal = './__fixtures__/hooks'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const fixtures = readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('hooks %s', async (file) => {
    await executeTests(fixturesDir, file, hooksTransform);
  });
});

describe('provider', () => {
  const literal = './__fixtures__/provider'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const fixtures = readdirSync(fixturesDir).filter(isFixture);

  it.each(fixtures)('provider %s', async (file) => {
    await executeTests(fixturesDir, file, providerTransform);
  });
});
