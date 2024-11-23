import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import * as transform from '../src/transforms/hooksToOptions';

const formatFile = async (path: string, source: string) => {
  const prettierConfig = await resolveConfig(path);
  return format(source, {
    ...prettierConfig,
    parser: 'typescript',
  });
};

const testFixture = async (file: string) => {
  const source = readFileSync(file, 'utf-8');

  const transformed = applyTransform(
    transform,
    { trpcFile: './trpc', trpcImportName: 'trpc' },
    { source },
    {},
  );
  const formatted = await formatFile(file, transformed);

  expect(formatted).toMatchSnapshot();
};

const literal = './fixtures'; // idk why but Vite seems to do some shit when the string is in-lined to URL
const fixturesDir = new URL(literal, import.meta.url).pathname;

const ONLY_RUN: string[] = [];

const fixtures = ONLY_RUN.length ? ONLY_RUN : readdirSync(fixturesDir);
it.each(fixtures)(
  '%s',
  async (file) => await testFixture(join(fixturesDir, file)),
);
