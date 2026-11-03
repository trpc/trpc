import { NodeServices } from '@effect/platform-node';
import type { TwoslashShikiReturn } from '@shikijs/twoslash/core';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { releaseTwoslashers, renderMarkdown } from './markdown.ts';
import {
  fingerprint,
  makeTwoslashCache,
  type TwoslashBlock,
  type TwoslashCache,
  type TwoslashCacheOptions,
} from './twoslash-cache.ts';

const result: TwoslashShikiReturn = {
  code: 'const a = 1;',
  meta: { extension: 'ts' },
  nodes: [],
};

function block(code: string): TwoslashBlock {
  return { code, lang: 'ts', options: {}, root: '/samples/app' };
}

/**
 * A temporary dir with a lockfile, a source file and a sample app that
 * compiles inline blocks, removed when the test ends.
 */
const setup = Effect.fn('setup')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'twoslash-cache-' });
  const lockfile = path.join(root, 'pnpm-lock.yaml');
  const source = path.join(root, 'packages/react/src/index.ts');
  const samplesDir = path.join(root, 'samples');
  yield* fs.makeDirectory(path.dirname(source), { recursive: true });
  yield* fs.makeDirectory(path.join(samplesDir, 'docs/src'), {
    recursive: true,
  });
  yield* fs.writeFileString(
    path.join(samplesDir, 'docs/src/app.ts'),
    'export {};',
  );
  yield* fs.writeFileString(lockfile, 'lockfileVersion: 9');
  yield* fs.writeFileString(source, 'export const a = 1;');
  yield* fs.writeFileString(
    path.join(samplesDir, 'docs/tsconfig.json'),
    JSON.stringify({
      compilerOptions: { lib: ['es5'], strict: true, types: [] },
      include: ['src'],
    }),
  );
  return {
    installed: path.join(root, 'node_modules/.pnpm/a@1/index.d.ts'),
    lockfile,
    options: {
      dir: path.join(root, 'cache'),
      lockfile,
      tools: { dir: root, packages: [] },
    },
    root,
    samplesDir,
    source,
  };
});

/**
 * A lockfile where `samples/app` depends on `a`, and `tools` on `b` and on
 * `c`, which depends on `d`, at these versions.
 */
function lockfileText(versions: {
  a: string;
  b: string;
  c?: string;
  tools?: string;
}) {
  const c = versions.c ?? '1.0.0';
  return [
    "lockfileVersion: '9.0'",
    'importers:',
    '  samples/app:',
    '    dependencies:',
    `      a: { specifier: '${versions.a}', version: '${versions.a}' }`,
    '  tools:',
    '    devDependencies:',
    `      b: { specifier: '${versions.b}', version: '${versions.b}' }`,
    `      c: { specifier: '${c}', version: '${c}' }`,
    `      twoslash: { specifier: '${versions.tools ?? '1.0.0'}', version: '${versions.tools ?? '1.0.0'}' }`,
    'packages:',
    `  a@${versions.a}: { resolution: { integrity: sha512-a${versions.a} } }`,
    `  b@${versions.b}: { resolution: { integrity: sha512-b${versions.b} } }`,
    `  c@${c}: { resolution: { integrity: sha512-c${c} } }`,
    '  d@1.0.0: { resolution: { integrity: sha512-d } }',
    `  twoslash@${versions.tools ?? '1.0.0'}: { resolution: { integrity: sha512-t } }`,
    'snapshots:',
    `  a@${versions.a}: {}`,
    `  b@${versions.b}: {}`,
    `  c@${c}: { dependencies: { d: 1.0.0 } }`,
    '  d@1.0.0: {}',
    `  twoslash@${versions.tools ?? '1.0.0'}: {}`,
    '',
  ].join('\n');
}

/** {@link setup}, with {@link lockfileText}'s lockfile and a block of `samples/app`. */
const setupWorkspace = Effect.fn('setupWorkspace')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dirs = yield* setup();
  yield* fs.writeFileString(
    dirs.lockfile,
    lockfileText({ a: '1.0.0', b: '1.0.0' }),
  );
  const options: TwoslashCacheOptions = {
    ...dirs.options,
    tools: { dir: path.join(dirs.root, 'tools'), packages: ['twoslash'] },
  };
  const appBlock: TwoslashBlock = {
    code: 'const a = 1;',
    lang: 'ts',
    options: {},
    root: path.join(dirs.root, 'samples/app'),
  };
  const installedFile = (store: string, name: string) =>
    path.join(
      dirs.root,
      'node_modules/.pnpm',
      store,
      'node_modules',
      name,
      'index.d.ts',
    );
  return { ...dirs, appBlock, installedFile, options };
});

describe('makeTwoslashCache', () => {
  it.effect('reads a block written by an earlier build', () =>
    Effect.gen(function* () {
      const dirs = yield* setup();
      const first = yield* makeTwoslashCache(dirs.options).open;
      const key = first.key(block('const a = 1;'));
      expect(first.get(key)).toBeUndefined();
      first.set(key, result, [
        { fileName: dirs.source, text: 'export const a = 1;' },
      ]);
      yield* first.flush;

      const next = makeTwoslashCache(dirs.options);
      const session = yield* next.open;
      expect(session.key(block('const a = 1;'))).toBe(key);
      expect(session.get(key)).toEqual(result);
      expect(session.get(session.key(block('const b = 1;')))).toBe(undefined);
      expect(next.stats).toEqual({ hits: 1, misses: 0 });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('misses when a file the block read changed', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dirs = yield* setup();
      const first = yield* makeTwoslashCache(dirs.options).open;
      const key = first.key(block('const a = 1;'));
      first.set(key, result, [
        { fileName: dirs.source, text: 'export const a = 1;' },
      ]);
      yield* first.flush;

      yield* fs.writeFileString(dirs.source, 'export const a = 2;');
      const session = yield* makeTwoslashCache(dirs.options).open;
      expect(session.get(key)).toBeUndefined();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'keys installed packages by the lockfile instead of their files',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* setup();
        const first = yield* makeTwoslashCache(dirs.options).open;
        const key = first.key(block('const a = 1;'));
        first.set(key, result, [
          { fileName: dirs.installed, text: 'export declare const a: 1;' },
        ]);
        yield* first.flush;

        const unchanged = yield* makeTwoslashCache(dirs.options).open;
        expect(unchanged.get(key)).toEqual(result);

        yield* fs.writeFileString(dirs.lockfile, 'lockfileVersion: 10');
        const upgraded = yield* makeTwoslashCache(dirs.options).open;
        expect(upgraded.key(block('const a = 1;'))).not.toBe(key);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps a workspace package's blocks when the lockfile changes elsewhere",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* setupWorkspace();
        const first = yield* makeTwoslashCache(dirs.options).open;
        const key = first.key(dirs.appBlock);
        first.set(key, result, [
          {
            fileName: dirs.installedFile('a@1.0.0', 'a'),
            text: 'export declare const a: 1;',
          },
        ]);
        yield* first.flush;

        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '1.0.0', b: '2.0.0' }),
        );
        const elsewhere = yield* makeTwoslashCache(dirs.options).open;
        expect(elsewhere.key(dirs.appBlock)).toBe(key);
        expect(elsewhere.get(key)).toEqual(result);

        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '2.0.0', b: '2.0.0' }),
        );
        const upgraded = yield* makeTwoslashCache(dirs.options).open;
        expect(upgraded.key(dirs.appBlock)).not.toBe(key);

        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '1.0.0', b: '2.0.0', tools: '1.1.0' }),
        );
        const newTools = yield* makeTwoslashCache(dirs.options).open;
        expect(newTools.key(dirs.appBlock)).not.toBe(key);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'lists the lockfile for a block that read a package outside its closure',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* setupWorkspace();
        const first = yield* makeTwoslashCache(dirs.options).open;
        const key = first.key(dirs.appBlock);
        first.set(key, result, [
          {
            fileName: dirs.installedFile('b@1.0.0', 'b'),
            text: 'export declare const b: 1;',
          },
        ]);
        yield* first.flush;

        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '1.0.0', b: '2.0.0' }),
        );
        const session = yield* makeTwoslashCache(dirs.options).open;
        expect(session.key(dirs.appBlock)).toBe(key);
        expect(session.get(key)).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'keeps a block that read a hoisted package outside its closure until the link moves',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dirs = yield* setupWorkspace();
        const store = path.join(dirs.root, 'node_modules/.pnpm');
        const hoisted = path.join(store, 'node_modules/c');
        const install = (version: string) =>
          Effect.gen(function* () {
            const dir = path.join(store, `c@${version}/node_modules/c`);
            yield* fs.makeDirectory(dir, { recursive: true });
            yield* fs.remove(hoisted).pipe(Effect.ignore);
            yield* fs.makeDirectory(path.dirname(hoisted), {
              recursive: true,
            });
            yield* fs.symlink(dir, hoisted);
          });
        yield* install('1.0.0');
        const first = yield* makeTwoslashCache(dirs.options).open;
        const key = first.key(dirs.appBlock);
        first.set(key, result, [
          {
            fileName: dirs.installedFile('c@1.0.0', 'c'),
            text: 'export declare const c: 1;',
          },
          {
            fileName: dirs.installedFile('d@1.0.0', 'd'),
            text: 'export declare const d: 1;',
          },
        ]);
        yield* first.flush;

        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '1.0.0', b: '2.0.0' }),
        );
        const elsewhere = yield* makeTwoslashCache(dirs.options).open;
        expect(elsewhere.get(key)).toEqual(result);

        yield* install('2.0.0');
        yield* fs.writeFileString(
          dirs.lockfile,
          lockfileText({ a: '1.0.0', b: '2.0.0', c: '2.0.0' }),
        );
        const moved = yield* makeTwoslashCache(dirs.options).open;
        expect(moved.get(key)).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('lists the lockfile for a block with an unresolved import', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dirs = yield* setupWorkspace();
      const first = yield* makeTwoslashCache(dirs.options).open;
      const key = first.key(dirs.appBlock);
      const unresolved: TwoslashShikiReturn = {
        ...result,
        nodes: [
          {
            character: 0,
            code: 2307,
            filename: 'index.ts',
            id: 'err-2307',
            length: 1,
            level: 'error',
            line: 0,
            start: 0,
            text: "Cannot find module 'b'",
            type: 'error',
          },
        ],
      };
      first.set(key, unresolved, []);
      yield* first.flush;

      yield* fs.writeFileString(
        dirs.lockfile,
        lockfileText({ a: '1.0.0', b: '2.0.0' }),
      );
      const session = yield* makeTwoslashCache(dirs.options).open;
      expect(session.get(key)).toBeUndefined();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "hits after an edit to a source's function bodies, not its declarations",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* setup();
        const text = 'export function f(): number {\n  return 1;\n}\n';
        yield* fs.writeFileString(dirs.source, text);
        const first = yield* makeTwoslashCache(dirs.options).open;
        const key = first.key(block('const a = 1;'));
        first.set(key, result, [{ fileName: dirs.source, text }]);
        yield* first.flush;

        yield* fs.writeFileString(
          dirs.source,
          'export function f(): number {\n  return 2 - 1;\n}\n',
        );
        const body = yield* makeTwoslashCache(dirs.options).open;
        expect(body.get(key)).toEqual(result);

        yield* fs.writeFileString(
          dirs.source,
          "import './globals.ts';\nexport function f(): number {\n  return 2 - 1;\n}\n",
        );
        const imports = yield* makeTwoslashCache(dirs.options).open;
        expect(imports.get(key)).toBeUndefined();

        yield* fs.writeFileString(
          dirs.source,
          'export function f(): string {\n  return "1";\n}\n',
        );
        const signature = yield* makeTwoslashCache(dirs.options).open;
        expect(signature.get(key)).toBeUndefined();

        yield* fs.writeFileString(
          dirs.source,
          '/** Returns one. */\nexport function f(): number {\n  return 1;\n}\n',
        );
        const docs = yield* makeTwoslashCache(dirs.options).open;
        expect(docs.get(key)).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it('fingerprints a source without declared types by its text', () => {
    expect(
      fingerprint(
        '/a.ts',
        'export function f(x: number) {\n  return x * 2;\n}',
      ),
    ).not.toBe(
      fingerprint(
        '/a.ts',
        'export function f(x: number) {\n  return x * 3;\n}',
      ),
    );
    expect(fingerprint('/a.ts', 'export const a: number = 1;')).toBe(
      fingerprint('/a.ts', 'export const a: number = 2;'),
    );
    expect(fingerprint('/a.d.ts', 'export declare const a: 1;')).not.toBe(
      fingerprint('/a.d.ts', 'export declare const a: 1; '),
    );
  });

  it.effect('deletes entries no build has read in two weeks', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dirs = yield* setup();
      const first = yield* makeTwoslashCache(dirs.options).open;
      const key = first.key(block('const a = 1;'));
      first.set(key, result, []);
      yield* first.flush;
      const file = path.join(dirs.options.dir, `${key}.json`);
      const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      yield* fs.utimes(file, old, old);

      const session = yield* makeTwoslashCache(dirs.options).open;
      expect(session.get(key)).toBeUndefined();
      expect(yield* fs.exists(file)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('renders a page from the cache the same as compiling it', () =>
    Effect.gen(function* () {
      const dirs = yield* setup();
      const markdown = [
        '```ts twoslash',
        'const keys = ["todos", 1] as const;',
        '//    ^?',
        '```',
      ].join('\n');

      const compiled = makeTwoslashCache(dirs.options);
      const first = yield* renderMarkdown(markdown, {
        basePath: '/docs',
        samplesDir: dirs.samplesDir,
        slug: 'test',
        sourceUrl: 'https://example.com',
        twoslashCache: compiled,
      });
      expect(compiled.stats).toEqual({ hits: 0, misses: 1 });
      expect(first.typeQueries).toEqual([
        ['const keys: readonly ["todos", 1]'],
      ]);

      const cached = makeTwoslashCache(dirs.options);
      const second = yield* renderMarkdown(markdown, {
        basePath: '/docs',
        samplesDir: dirs.samplesDir,
        slug: 'test',
        sourceUrl: 'https://example.com',
        twoslashCache: cached,
      });
      expect(cached.stats).toEqual({ hits: 1, misses: 0 });
      expect(second).toEqual(first);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'misses after an edit to a file of the app outside its tsconfig that the block imports',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dirs = yield* setup();
        const stub = path.join(dirs.samplesDir, 'docs/open/stub.ts');
        yield* fs.makeDirectory(path.dirname(stub));
        yield* fs.writeFileString(stub, 'export declare const a: number;');
        const markdown = [
          '```ts twoslash',
          "import { a } from '../open/stub';",
          'const b = a;',
          '//    ^?',
          '```',
        ].join('\n');
        const render = (cache: TwoslashCache) =>
          renderMarkdown(markdown, {
            basePath: '/docs',
            samplesDir: dirs.samplesDir,
            slug: 'test',
            sourceUrl: 'https://example.com',
            twoslashCache: cache,
          });

        const first = makeTwoslashCache(dirs.options);
        expect((yield* render(first)).typeQueries).toEqual([
          ['const b: number'],
        ]);

        yield* fs.writeFileString(stub, 'export declare const a: string;');
        // A twoslasher keeps the files it read, as a build's processes do.
        releaseTwoslashers();
        const edited = makeTwoslashCache(dirs.options);
        expect((yield* render(edited)).typeQueries).toEqual([
          ['const b: string'],
        ]);
        expect(edited.stats).toEqual({ hits: 0, misses: 1 });
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
