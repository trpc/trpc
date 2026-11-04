import { createServer, type Server } from 'node:http';
import { NodeServices } from '@effect/platform-node';
import { Duration, Effect, Exit, FileSystem, Path, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'vitest';
import { git } from './command.ts';
import {
  branchMoved,
  latestTag,
  tarballUrl,
  waitForVersions,
} from './release.ts';
import { writeVersions } from './workspace.ts';

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

const commit = Effect.fn('commit')(function* (root: string, message: string) {
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
    message,
  );
});

const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped();
  yield* git(root, 'init', '--quiet', '--initial-branch', 'main');
  yield* commit(root, 'initial');
  return root;
});

const tag = (root: string, name: string) => git(root, 'tag', '--no-sign', name);

describe('latestTag', () => {
  it('finds the latest stable tag and skips prereleases', () =>
    run(
      Effect.gen(function* () {
        const root = yield* repo;
        yield* tag(root, 'v11.22.1');
        yield* commit(root, 'feat: a');
        yield* tag(root, 'v11.23.0-rc.0');
        yield* commit(root, 'fix: b');
        expect(yield* latestTag(root)).toBe('v11.22.1');
        yield* tag(root, 'v11.23.0');
        expect(yield* latestTag(root)).toBe('v11.23.0');
        expect(yield* latestTag(root, 'v11.23.0^')).toBe('v11.22.1');
      }),
    ));
});

describe('branchMoved', () => {
  it('tells whether the remote branch has commits HEAD lacks', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const remote = yield* repo;
        const clone = yield* fs.makeTempDirectoryScoped();
        yield* git(clone, 'clone', '--quiet', remote, '.');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(false);
        yield* commit(clone, 'chore: release v11.23.1');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(false);
        yield* commit(remote, 'fix: merged meanwhile');
        expect(yield* branchMoved(clone, 'origin', 'main')).toBe(true);
      }),
    ));
});

describe('writeVersions', () => {
  it('versions every package, pins peers and keeps workspace ranges', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const write = (file: string, value: unknown) =>
          Effect.gen(function* () {
            yield* fs.makeDirectory(path.join(root, path.dirname(file)), {
              recursive: true,
            });
            yield* fs.writeFileString(
              path.join(root, file),
              `${JSON.stringify(value, null, 2)}\n`,
            );
          });
        const read = (file: string) =>
          fs
            .readFileString(path.join(root, file))
            .pipe(Effect.map((raw) => JSON.parse(raw) as unknown));
        yield* write('packages/server/package.json', {
          name: '@trpc/server',
          version: '11.22.1',
        });
        yield* write('packages/openapi/package.json', {
          name: '@trpc/openapi',
          version: '11.22.1-alpha',
          peerDependencies: { '@trpc/server': '11.22.1' },
          devDependencies: { '@trpc/server': 'workspace:*' },
        });
        yield* write('packages/tests/package.json', {
          name: '@trpc/tests',
          version: '11.22.1',
          private: true,
        });

        const result = yield* writeVersions(root, '11.23.0');

        expect(result.files).toEqual([
          'packages/openapi/package.json',
          'packages/server/package.json',
          'packages/tests/package.json',
        ]);
        expect([...result.published]).toEqual([
          ['@trpc/server', '11.23.0'],
          ['@trpc/openapi', '11.23.0-alpha'],
        ]);
        expect(yield* read('packages/openapi/package.json')).toEqual({
          name: '@trpc/openapi',
          version: '11.23.0-alpha',
          peerDependencies: { '@trpc/server': '11.23.0' },
          devDependencies: { '@trpc/server': 'workspace:*' },
        });
      }),
    ));
});

describe('tarballUrl', () => {
  it('points at the scoped tarball', () => {
    expect(
      tarballUrl('https://registry.npmjs.org/', '@trpc/server', '11.23.0'),
    ).toBe('https://registry.npmjs.org/@trpc/server/-/server-11.23.0.tgz');
  });
});

/** A registry that serves a tarball once it has been asked for it `after` times. */
const registry = (after: number) =>
  Effect.acquireRelease(
    Effect.callback<{
      server: Server;
      url: string;
      requests: () => number;
    }>((resume) => {
      let requests = 0;
      const server = createServer((_req, res) => {
        requests++;
        res.statusCode = requests > after ? 200 : 404;
        res.end();
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' ? address?.port : undefined;
        resume(
          Effect.succeed({
            server,
            url: `http://127.0.0.1:${port}`,
            requests: () => requests,
          }),
        );
      });
    }),
    ({ server }) =>
      Effect.callback<void>((resume) => {
        server.close(() => resume(Effect.void));
      }),
  );

describe('waitForVersions', () => {
  it('waits until npm serves the version', () =>
    run(
      Effect.gen(function* () {
        const npm = yield* registry(2);
        yield* waitForVersions(
          new Map([['@trpc/server', '11.23.0']]),
          npm.url,
          {
            timeout: Duration.seconds(5),
            interval: Duration.millis(10),
          },
        );
        expect(npm.requests()).toBe(3);
      }),
    ));

  it('fails, naming what npm still holds back, after the timeout', () =>
    run(
      Effect.gen(function* () {
        const npm = yield* registry(Infinity);
        const exit = yield* waitForVersions(
          new Map([['@trpc/server', '11.23.0']]),
          npm.url,
          {
            timeout: Duration.millis(50),
            interval: Duration.millis(10),
          },
        ).pipe(Effect.exit);
        expect(Exit.isFailure(exit) && String(exit.cause)).toContain(
          "npm accepted these but doesn't serve them yet: @trpc/server@11.23.0",
        );
      }),
    ));
});
