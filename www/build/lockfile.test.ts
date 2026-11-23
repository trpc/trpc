import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { installedPackageOf, readLockfile } from './lockfile.ts';

const lockfile = (lines: ReadonlyArray<string>) =>
  [
    '---',
    "lockfileVersion: '9.0'",
    'importers:',
    '  .:',
    '    packageManagerDependencies:',
    '      pnpm: { specifier: 12.4.1, version: 12.4.1 }',
    'packages:',
    '  pnpm@12.4.1: { resolution: { integrity: sha512-p } }',
    'snapshots:',
    '  pnpm@12.4.1: {}',
    '---',
    "lockfileVersion: '9.0'",
    'settings:',
    '  autoInstallPeers: true',
    ...lines,
    '',
  ].join('\n');

const workspace = [
  'importers:',
  '  apps/web:',
  '    dependencies:',
  "      lib: { specifier: 'workspace:*', version: link:../../packages/lib }",
  "      ts6: { specifier: 'npm:typescript@6.0.3', version: typescript@6.0.3 }",
  '  packages/lib:',
  '    dependencies:',
  '      react-dom: { specifier: 19.3.0, version: 19.3.0(react@19.3.0) }',
  '  tools:',
  '    devDependencies:',
  '      other: { specifier: 1.0.0, version: 1.0.0 }',
  'packages:',
  '  other@1.0.0: { resolution: { integrity: sha512-o } }',
  '  react@19.3.0: { resolution: { integrity: sha512-r } }',
  '  react-dom@19.3.0: { resolution: { integrity: sha512-d } }',
  '  scheduler@0.27.0: { resolution: { integrity: sha512-s } }',
  '  typescript@6.0.3: { resolution: { integrity: sha512-t } }',
  'snapshots:',
  '  other@1.0.0: {}',
  '  react@19.3.0: {}',
  '  react-dom@19.3.0(react@19.3.0):',
  '    dependencies:',
  '      react: 19.3.0',
  '      scheduler: 0.27.0',
  '  scheduler@0.27.0: {}',
  '  typescript@6.0.3: {}',
];

/** Writes `text` as a temporary `pnpm-lock.yaml` and reads it. */
const read = Effect.fn('read')(function* (text: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'lockfile-' });
  const file = path.join(root, 'pnpm-lock.yaml');
  yield* fs.writeFileString(file, text);
  return { lockfile: readLockfile(file), root };
});

describe('readLockfile', () => {
  it.effect(
    'reaches linked workspace packages, aliases and dependencies of dependencies',
    () =>
      Effect.gen(function* () {
        const { lockfile: parsed, root } = yield* read(lockfile(workspace));
        const closure = parsed.closure(`${root}/apps/web`);
        expect([...(closure?.packages ?? [])].toSorted()).toEqual([
          'react-dom@19.3.0',
          'react@19.3.0',
          'scheduler@0.27.0',
          'typescript@6.0.3',
        ]);
        expect(parsed.closure(`${root}/tools`)?.packages).toEqual(
          new Set(['other@1.0.0']),
        );
        expect(parsed.closure(`${root}/apps/web`, ['ts6'])?.packages).toEqual(
          new Set(['typescript@6.0.3']),
        );
        expect(parsed.closure(`${root}/apps/missing`)).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("changes a closure's hash only when a package in it changes", () =>
    Effect.gen(function* () {
      const before = yield* read(lockfile(workspace));
      const hashOf = (parsed: typeof before, dir: string) =>
        parsed.lockfile.closure(`${parsed.root}/${dir}`)?.hash;

      const elsewhere = yield* read(
        lockfile(
          workspace.map((line) => line.replace('sha512-o', 'sha512-o2')),
        ),
      );
      expect(hashOf(elsewhere, 'apps/web')).toBe(hashOf(before, 'apps/web'));
      expect(hashOf(elsewhere, 'tools')).not.toBe(hashOf(before, 'tools'));

      const transitive = yield* read(
        lockfile(
          workspace.map((line) => line.replace('sha512-s', 'sha512-s2')),
        ),
      );
      expect(hashOf(transitive, 'apps/web')).not.toBe(
        hashOf(before, 'apps/web'),
      );
      expect(hashOf(transitive, 'tools')).toBe(hashOf(before, 'tools'));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    'reaches what an installed package depends on, whichever its peers',
    () =>
      Effect.gen(function* () {
        const parsed = (yield* read(lockfile(workspace))).lockfile;
        expect([...parsed.packagesFrom('react-dom@19.3.0')].toSorted()).toEqual(
          ['react-dom@19.3.0', 'react@19.3.0', 'scheduler@0.27.0'],
        );
        expect(parsed.packagesFrom('missing@1.0.0').size).toBe(0);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "includes how a linked package's types resolve from its package.json",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root } = yield* read(lockfile(workspace));
        const file = `${root}/pnpm-lock.yaml`;
        yield* fs.makeDirectory(`${root}/packages/lib`, { recursive: true });
        const manifest = (exports: string, version: string) =>
          fs.writeFileString(
            `${root}/packages/lib/package.json`,
            JSON.stringify({ exports, name: 'lib', version }),
          );
        yield* manifest('./src/index.ts', '1.0.0');
        const first = readLockfile(file).closure(`${root}/apps/web`)?.hash;
        yield* manifest('./src/index.ts', '1.0.1');
        expect(readLockfile(file).closure(`${root}/apps/web`)?.hash).toBe(
          first,
        );
        yield* manifest('./dist/index.d.ts', '1.0.1');
        expect(readLockfile(file).closure(`${root}/apps/web`)?.hash).not.toBe(
          first,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('installedPackageOf', () => {
  it('reads the package and version from the store path', () => {
    expect(
      installedPackageOf(
        '/w/node_modules/.pnpm/@types+react@19.3.0/node_modules/@types/react/index.d.ts',
      ),
    ).toBe('@types/react@19.3.0');
    expect(
      installedPackageOf(
        '/w/node_modules/.pnpm/react-dom@19.3.0_react@19.3.0/node_modules/react-dom/index.d.ts',
      ),
    ).toBe('react-dom@19.3.0');
    expect(
      installedPackageOf('/w/node_modules/.pnpm/node_modules/react/index.d.ts'),
    ).toBeUndefined();
    expect(installedPackageOf('/w/packages/lib/src/index.ts')).toBeUndefined();
  });
});
