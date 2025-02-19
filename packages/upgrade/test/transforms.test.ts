import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe } from 'node:test';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import * as hooksTransform from '../src/transforms/hooksToOptions';
import * as providerTransform from '../src/transforms/provider';

const formatFile = async (path: string, source: string) => {
  const prettierConfig = await resolveConfig(path);
  return format(source, {
    ...prettierConfig,
    parser: 'typescript',
  });
};

const testFixture = async (file: string, transform: any) => {
  const source = readFileSync(file, 'utf-8');

  const transformed = applyTransform(
    transform,
    { trpcImportName: 'trpc' },
    { source },
    {},
  );
  const formatted = await formatFile(file, transformed);

  expect(formatted).toMatchSnapshot();
};

describe('hooks', () => {
  const literal = './__fixtures__/hooks'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const ONLY_RUN: string[] = [];

  const fixtures = ONLY_RUN.length ? ONLY_RUN : readdirSync(fixturesDir);
  it.each(fixtures)(
    'hooks %s',
    async (file) => await testFixture(join(fixturesDir, file), hooksTransform),
  );
});

describe('provider', () => {
  const literal = './__fixtures__/provider'; // idk why but Vite seems to do some shit when the string is in-lined to URL
  const fixturesDir = new URL(literal, import.meta.url).pathname;

  const ONLY_RUN: string[] = [];

  const fixtures = ONLY_RUN.length ? ONLY_RUN : readdirSync(fixturesDir);
  it.each(fixtures)(
    'provider %s',
    async (file) =>
      await testFixture(join(fixturesDir, file), providerTransform),
  );
});
