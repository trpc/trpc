import { readFile } from 'node:fs/promises';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import * as transform from '../src/transforms/hooks-to-options';

const formatFile = async (path: string, source: string) => {
  const prettierConfig = await resolveConfig(path);
  return format(source, {
    ...prettierConfig,
    parser: 'typescript',
  });
};

const testFixture = async (file: string) => {
  const fixturePath = new URL(file, import.meta.url).pathname;

  const source = await readFile(fixturePath, 'utf-8');

  const transformed = applyTransform(transform, {}, { source });
  const formatted = await formatFile(fixturePath, transformed);

  const output = await readFile(fixturePath.replace('.in', '.out'), 'utf-8');

  expect(formatted).toEqual(output);
};

it.each([
  'fixtures/hooks-basic-query.in.ts',
  'fixtures/suspense-destructuring.in.ts',
])('%s', async (file) => await testFixture(file));
