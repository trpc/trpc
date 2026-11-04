import { createServer } from 'node:http';
import { NodeServices } from '@effect/platform-node';
import { Effect, Exit, FileSystem, Path, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'vitest';
import { git, output } from './command.ts';
import {
  onRegistry,
  packTarballs,
  readTarballs,
  tarballName,
} from './tarballs.ts';
import { publishedVersions, type WorkspacePackage } from './workspace.ts';

const run = <TValue, TError>(
  effect: Effect.Effect<
    TValue,
    TError,
    | FileSystem.FileSystem
    | Path.Path
    | Scope.Scope
    | ChildProcessSpawner.ChildProcessSpawner
  >,
) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

const writeJson = Effect.fn('writeJson')(function* (
  file: string,
  value: unknown,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, `${JSON.stringify(value, null, 2)}\n`);
});

const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped();
  yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
  yield* git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--allow-empty',
    '--message',
    'initial',
  );
  return root;
});

/** A tarball in `dir` the way `pnpm pack` lays one out. */
const fakeTarball = Effect.fn('fakeTarball')(function* (
  dir: string,
  file: string,
  pkg: { readonly name: string; readonly version: string },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const staging = yield* fs.makeTempDirectoryScoped();
  yield* writeJson(path.join(staging, 'package', 'package.json'), pkg);
  yield* output(staging, 'tar', [
    '-czf',
    path.join(dir, file),
    'package/package.json',
  ]);
});

describe('publishedVersions', () => {
  it('puts each public package after the packages it needs', () => {
    const packages: Array<WorkspacePackage> = [
      {
        dir: 'packages/client',
        name: '@trpc/client',
        pkg: { peerDependencies: { '@trpc/server': '11.22.1' } },
      },
      {
        dir: 'packages/openapi',
        name: '@trpc/openapi',
        pkg: {
          dependencies: { '@trpc/client': 'workspace:*' },
          devDependencies: { '@trpc/tests': 'workspace:*' },
        },
      },
      {
        dir: 'packages/server',
        name: '@trpc/server',
        pkg: { devDependencies: { '@trpc/client': 'workspace:*' } },
      },
      {
        dir: 'packages/tests',
        name: '@trpc/tests',
        pkg: { private: true },
      },
    ];
    expect([...publishedVersions(packages, '11.23.0')]).toEqual([
      ['@trpc/server', '11.23.0'],
      ['@trpc/client', '11.23.0'],
      ['@trpc/openapi', '11.23.0-alpha'],
    ]);
  });
});

describe('tarballName', () => {
  it('names a scoped tarball like pnpm pack', () => {
    expect(tarballName('@trpc/server', '11.23.0')).toBe(
      'trpc-server-11.23.0.tgz',
    );
  });
});

describe('packTarballs', () => {
  it(
    'packs the given packages, which readTarballs accepts',
    () =>
      run(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* repo;
          const dir = yield* fs.makeTempDirectoryScoped();
          for (const name of ['client', 'server', 'tests']) {
            yield* writeJson(
              path.join(root, 'packages', name, 'package.json'),
              {
                name: `@trpc/${name}`,
                version: '11.23.0',
              },
            );
          }
          const versions = new Map([
            ['@trpc/server', '11.23.0'],
            ['@trpc/client', '11.23.0'],
          ]);
          yield* packTarballs(root, versions, dir);
          expect((yield* fs.readDirectory(dir)).sort()).toEqual([
            'commit',
            'trpc-client-11.23.0.tgz',
            'trpc-server-11.23.0.tgz',
          ]);
          const tarballs = yield* readTarballs(root, dir, versions);
          expect(tarballs.map(({ name }) => name)).toEqual([
            '@trpc/server',
            '@trpc/client',
          ]);
        }),
      ),
    60_000,
  );
});

describe('readTarballs', () => {
  const versions = new Map([['@trpc/server', '11.23.0']]);

  /**
   * Why readTarballs refuses `tarballs`, as `[file, package]` pairs, packed
   * from `commit` (HEAD by default).
   */
  const refusal = (
    tarballs: ReadonlyArray<
      readonly [string, { readonly name: string; readonly version: string }]
    >,
    commit?: string,
  ) =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* repo;
        const dir = yield* fs.makeTempDirectoryScoped();
        for (const [file, pkg] of tarballs) {
          yield* fakeTarball(dir, file, pkg);
        }
        yield* fs.writeFileString(
          path.join(dir, 'commit'),
          `${commit ?? (yield* git(root, 'rev-parse', 'HEAD'))}\n`,
        );
        const exit = yield* readTarballs(root, dir, versions).pipe(Effect.exit);
        return Exit.isFailure(exit) ? String(exit.cause) : 'accepted';
      }),
    );

  const server = { name: '@trpc/server', version: '11.23.0' };

  it('accepts exactly the release', async () => {
    expect(await refusal([['trpc-server-11.23.0.tgz', server]])).toBe(
      'accepted',
    );
  });

  it('refuses a missing tarball', async () => {
    expect(await refusal([])).toContain(
      'Missing: trpc-server-11.23.0.tgz. Not part of it: none.',
    );
  });

  it('refuses a tarball that is not part of the release', async () => {
    expect(
      await refusal([
        ['trpc-server-11.23.0.tgz', server],
        ['trpc-client-11.23.0.tgz', { ...server, name: '@trpc/client' }],
      ]),
    ).toContain('Missing: none. Not part of it: trpc-client-11.23.0.tgz.');
  });

  it('refuses a tarball whose package is not what its name says', async () => {
    expect(
      await refusal([
        ['trpc-server-11.23.0.tgz', { ...server, version: '12.0.0' }],
      ]),
    ).toContain(
      'trpc-server-11.23.0.tgz is @trpc/server@12.0.0, not @trpc/server@11.23.0',
    );
  });

  it('refuses tarballs packed from another commit', async () => {
    const other = '0123456789abcdef0123456789abcdef01234567';
    expect(
      await refusal([['trpc-server-11.23.0.tgz', server]], other),
    ).toContain(`are packed from ${other}, but HEAD is`);
  });
});

describe('onRegistry', () => {
  it(
    'compares what the registry has with the tarball',
    () =>
      run(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped();
          const server = { name: '@trpc/server', version: '11.23.0' };
          const changed = { ...server, description: 'changed' };
          yield* fakeTarball(dir, 'published.tgz', server);
          yield* fakeTarball(dir, 'other.tgz', changed);
          const published = yield* fs.readFile(path.join(dir, 'published.tgz'));
          const url = yield* Effect.acquireRelease(
            Effect.callback<{ url: string; close: () => void }>((resume) => {
              const registry = createServer((req, res) => {
                const base = `http://${req.headers.host}`;
                if (req.url === '/@trpc%2fserver') {
                  res.setHeader('content-type', 'application/json');
                  res.end(
                    JSON.stringify({
                      versions: {
                        '11.23.0': { dist: { tarball: `${base}/server.tgz` } },
                      },
                    }),
                  );
                } else if (req.url === '/server.tgz') {
                  res.end(published);
                } else {
                  res.statusCode = req.url === '/@trpc%2fclient' ? 500 : 404;
                  res.end();
                }
              });
              registry.listen(0, '127.0.0.1', () => {
                const address = registry.address();
                const port =
                  typeof address === 'object' ? address?.port : undefined;
                resume(
                  Effect.succeed({
                    url: `http://127.0.0.1:${port}/`,
                    close: () => registry.close(),
                  }),
                );
              });
            }),
            ({ close }) => Effect.sync(close),
          ).pipe(Effect.map(({ url }) => url));
          const tarball = (file: string, pkg: typeof server) => ({
            ...pkg,
            file: path.join(dir, file),
          });

          expect(yield* onRegistry(url, tarball('published.tgz', server))).toBe(
            'same',
          );
          expect(yield* onRegistry(url, tarball('other.tgz', server))).toBe(
            'different',
          );
          expect(
            yield* onRegistry(
              url,
              tarball('published.tgz', { ...server, version: '11.23.1' }),
            ),
          ).toBe('absent');
          expect(
            yield* onRegistry(
              url,
              tarball('published.tgz', { ...server, name: '@trpc/next' }),
            ),
          ).toBe('absent');
          const failed = yield* onRegistry(
            url,
            tarball('published.tgz', { ...server, name: '@trpc/client' }),
          ).pipe(Effect.exit);
          expect(String(Exit.isFailure(failed) && failed.cause)).toContain(
            '500 Internal Server Error',
          );
        }),
      ),
    30_000,
  );
});
