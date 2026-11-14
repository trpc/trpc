import { createServer, type Server } from 'node:http';
import { NodeServices } from '@effect/platform-node';
import { Duration, Effect, Exit, FileSystem, Path, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'vitest';
import { git } from './command.ts';
import {
  branchMoved,
  defaultWait,
  latestTag,
  packCanary,
  publishStable,
  pushReleaseCommit,
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

const failure = <TValue, TError, TRequirements>(
  effect: Effect.Effect<TValue, TError, TRequirements>,
) =>
  effect.pipe(
    Effect.exit,
    Effect.map((exit) => (Exit.isFailure(exit) ? String(exit.cause) : 'ok')),
  );

/** A clone of `remote`, which takes pushes to its checked-out branch. */
const cloneOf = Effect.fn('cloneOf')(function* (remote: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* git(remote, 'config', 'receive.denyCurrentBranch', 'updateInstead');
  const clone = yield* fs.makeTempDirectoryScoped();
  yield* git(clone, 'clone', '--quiet', remote, '.');
  yield* git(clone, 'config', 'user.name', 'Test');
  yield* git(clone, 'config', 'user.email', 'test@example.com');
  yield* git(clone, 'config', 'commit.gpgsign', 'false');
  return clone;
});

/** Commits `content` as `file` in `root`. */
const commitFile = Effect.fn('commitFile')(function* (
  root: string,
  file: string,
  content: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(root, file), content);
  yield* git(root, 'add', '--', file);
  yield* commit(root, `chore: edit ${file}`);
});

describe('pushReleaseCommit', () => {
  it('merges what landed on the branch meanwhile and pushes', () =>
    run(
      Effect.gen(function* () {
        const remote = yield* repo;
        const clone = yield* cloneOf(remote);
        yield* commitFile(clone, 'version.txt', '11.23.1');
        const release = yield* git(clone, 'rev-parse', 'HEAD');
        yield* commitFile(remote, 'docs.md', 'merged meanwhile');

        const pushed = yield* pushReleaseCommit(clone, {
          remote: 'origin',
          branch: 'main',
          tag: 'v11.23.1',
        });

        expect(pushed).toBe(release);
        const tip = yield* git(remote, 'rev-parse', 'main');
        expect(yield* git(remote, 'rev-parse', `${tip}^1`)).toBe(release);
        expect(yield* git(remote, 'log', '-1', '--format=%s', tip)).toBe(
          'chore: release v11.23.1 (merge main)',
        );
        expect(yield* git(remote, 'show', `${tip}:version.txt`)).toBe(
          '11.23.1',
        );
        expect(yield* git(remote, 'show', `${tip}:docs.md`)).toBe(
          'merged meanwhile',
        );
        yield* git(remote, 'tag', '--no-sign', 'v11.23.1', pushed);
        yield* commitFile(remote, 'next.md', 'landed after the release');
        expect(yield* latestTag(remote, 'main')).toBe('v11.23.1');
      }),
    ));

  it('fails, publishing nothing, when what landed conflicts', () =>
    run(
      Effect.gen(function* () {
        const remote = yield* repo;
        const clone = yield* cloneOf(remote);
        yield* commitFile(clone, 'version.txt', '11.23.1');
        const release = yield* git(clone, 'rev-parse', 'HEAD');
        yield* commitFile(remote, 'version.txt', '11.24.0');
        const before = yield* git(remote, 'rev-parse', 'main');

        const push = pushReleaseCommit(clone, {
          remote: 'origin',
          branch: 'main',
          tag: 'v11.23.1',
        });

        expect(yield* failure(push)).toContain(
          "main moved since this run checked it out and doesn't merge into the release commit; release again from the new main. Nothing was published.",
        );
        expect(yield* git(remote, 'rev-parse', 'main')).toBe(before);
        expect(yield* git(clone, 'rev-parse', 'HEAD')).toBe(release);
        expect(yield* git(clone, 'status', '--porcelain')).toBe('');
      }),
    ));
});

describe('the release guards', () => {
  it('publishes a stable release only from the branch', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const remote = yield* repo;
        yield* tag(remote, 'v11.23.0');
        const clone = yield* fs.makeTempDirectoryScoped();
        yield* git(clone, 'clone', '--quiet', remote, '.');
        yield* commit(clone, 'fix: not merged');
        const release = publishStable(clone, {
          bump: 'patch',
          distTag: 'latest',
          dryRun: false,
          provenance: false,
          remote: 'origin',
          branch: 'main',
          wait: defaultWait,
          dir: yield* fs.makeTempDirectoryScoped(),
        });
        expect(yield* failure(release)).toContain(
          "HEAD isn't on origin main; release from main. Nothing was published.",
        );
      }),
    ));

  it('packs a canary only from a clean working tree', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* repo;
        yield* tag(root, 'v11.23.0');
        yield* fs.writeFileString(path.join(root, 'edit.ts'), '');
        const canary = packCanary(root, {
          preid: 'canary',
          dir: yield* fs.makeTempDirectoryScoped(),
        });
        expect(yield* failure(canary)).toContain(
          'The working tree has changes',
        );
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
