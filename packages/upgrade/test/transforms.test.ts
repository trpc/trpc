import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { applyTransform } from 'jscodeshift/src/testUtils';
import { format } from 'oxfmt';
import { createElement, type FC } from 'react';
import { describe, expect, it } from 'vitest';
import * as hooksTransform from '../src/transforms/hooksToOptions';
import * as providerTransform from '../src/transforms/provider';
import type { ComponentFile, SpecDefFile } from './specDef';

const formatFile = async (path: string, source: string) => {
  const {
    $schema: _schema,
    ignorePatterns: _ignorePatterns,
    overrides: _overrides,
    ...config
  } = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../.oxfmtrc.json'), 'utf-8'),
  );
  const result = await format(path, source, config);
  if (result.errors.length > 0) {
    throw new Error(`Failed to format ${path}`, { cause: result.errors });
  }
  return result.code;
};

type Transformer = Parameters<typeof applyTransform>[0];

/** What the CLI would find in a project, for the fixtures that need it */
const fixtureOptions: Record<string, Record<string, unknown>> = {
  'importAlias.tsx': { trpcImportName: 'api' },
  'importAliasTwoModules.tsx': { trpcImportName: 'api' },
  'importAliasAmbiguous.tsx': { trpcImportName: 'api' },
  'importAliasWithPlain.tsx': { trpcImportName: 'api' },
  'providerRouterType.tsx': {
    routerType: {
      name: 'AppRouter',
      file: join(import.meta.dirname, '__fixtures__/provider/basic.trpc.tsx'),
      extension: '',
    },
  },
  'providerRouterTypeNested.tsx': {
    routerType: {
      name: 'AppRouter',
      file: join(import.meta.dirname, '__fixtures__/provider/server/index.ts'),
      extension: '',
    },
  },
  'providerRouterTypeTaken.tsx': {
    routerType: {
      name: 'AppRouter',
      file: join(import.meta.dirname, '__fixtures__/provider/server/index.ts'),
      extension: '',
    },
  },
};

const snapshotTestTransform = async (file: string, transform: Transformer) => {
  const source = readFileSync(file, 'utf-8');

  const transformed = applyTransform(
    transform,
    {
      trpcImportName: 'trpc',
      ...fixtureOptions[file.split('/').at(-1) ?? ''],
    },
    { source, path: file },
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
      // oxlint-disable-next-line no-console
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

      // oxlint-disable-next-line no-console
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

  // Classic `withTRPC` calls `config` once per mount. A second call opens a
  // second WebSocket when `config` makes a `createWSClient`.
  it.each([
    'nextConfigOnce.snap.tsx',
    'nextConfigOnceUnknown.snap.tsx',
    'nextConfigNamedLikeWrapper.snap.tsx',
  ])(
    'the generated `withTRPC` in %s calls `config` once per mount',
    async (file) => {
      const setup = await importFixture<{
        configCalls: { count: number };
        withTRPC: (app: FC) => FC<{ pageProps: object }>;
      }>(globDir, file);
      const App = setup.withTRPC(() => createElement('p', null, 'app'));

      try {
        const utils = render(createElement(App, { pageProps: {} }));

        expect(utils.container).toHaveTextContent('app');
        expect(setup.configCalls.count).toBe(1);
      } finally {
        cleanup();
      }
    },
  );
});

describe('printing', () => {
  it('keeps the directive line and adds imports to the import block', () => {
    const source = [
      `'use client';`,
      ``,
      `import * as React from 'react';`,
      `import { trpc } from './trpc';`,
      ``,
      `export function Component() {`,
      `  return trpc.post.list.useQuery().data;`,
      `}`,
      ``,
    ].join('\n');
    const output = applyTransform(
      hooksTransform,
      { trpcImportName: 'trpc' },
      { source, path: 'component.tsx' },
      {},
    );
    expect(output).toBe(
      [
        `'use client';`,
        ``,
        `import * as React from 'react';`,
        `import { useTRPC } from './trpc';`,
        `import { useQuery } from '@tanstack/react-query';`,
        ``,
        `export function Component() {`,
        `  const trpc = useTRPC();`,
        `  return useQuery(trpc.post.list.queryOptions()).data;`,
        `}`,
      ].join('\n'),
    );
  });
});

// The CLI runs provider, then hooks, on every file
describe('both transforms on a consumer', () => {
  const run = (source: string, path = 'consumer.tsx') =>
    [providerTransform, hooksTransform].reduce(
      (code, transform) =>
        applyTransform(
          transform,
          { trpcImportName: 'api' },
          { source: code, path },
          {},
        ) || code,
      source,
    );
  // The setup the consumers import as `api`
  const setup = () =>
    run(
      [
        "import { createTRPCReact } from '@trpc/react-query';",
        "import type { AppRouter } from './router';",
        'export const api = createTRPCReact<AppRouter>();',
      ].join('\n'),
      'utils/api.tsx',
    );

  it('follows `import { api as trpc }`', () => {
    const output = run(
      [
        "import { api as trpc } from './utils/api';",
        'export function Component() {',
        '  return trpc.post.list.useQuery().data;',
        '}',
      ].join('\n'),
    );
    // What the consumer now imports, the setup now exports
    expect(setup()).toMatch(/export const \{[^}]*\buseTRPC\b/);
    expect(setup()).not.toMatch(/export const api\b/);
    expect(output).toContain("import { useTRPC } from './utils/api';");
    expect(output).toContain('useQuery(trpc.post.list.queryOptions())');
    expect(output).not.toContain('api as trpc');
  });

  it('leaves a TODO when two imports look like the setup', () => {
    const output = run(
      [
        "import { api as restApi } from './other';",
        "import { api as trpc } from './utils/api';",
        'export function Component() {',
        '  restApi.useQuery();',
        '  return trpc.post.list.useQuery().data;',
        '}',
      ].join('\n'),
    );
    expect(output).toContain(
      'TODO(@trpc/upgrade): more than one import looks like your tRPC setup `api`',
    );
    // The setup no longer exports `api`, so the TODO is what's left to do
    expect(setup()).not.toMatch(/export const api\b/);
    // Once per import, though both transforms add it
    expect(output.match(/more than one import/g)).toHaveLength(2);
    expect(output).toContain('api as trpc');
  });
});
