import { NodeServices } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { Effect, FileSystem, Path, Predicate } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import { lines, output } from './command.ts';
import { land, type Steps, type Target } from './land.ts';

const target: Target = {
  remote: 'origin',
  branch: 'v12',
  workspace: 'next',
  attempts: 3,
};

const git = (dir: string, ...args: ReadonlyArray<string>) =>
  output(dir, 'git', args);

const write = Effect.fn('write')(function* (
  dir: string,
  file: string,
  contents: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(path.join(dir, file)), {
    recursive: true,
  });
  yield* fs.writeFileString(path.join(dir, file), contents);
});

const commit = Effect.fn('commit')(function* (dir: string, message: string) {
  yield* git(dir, 'add', '--all');
  yield* git(dir, 'commit', '--quiet', '--message', message);
});

const identify = Effect.fn('identify')(function* (dir: string) {
  yield* git(dir, 'config', 'user.name', 'Test');
  yield* git(dir, 'config', 'user.email', 'test@example.com');
  yield* git(dir, 'config', 'commit.gpgsign', 'false');
});

/**
 * What the stub `pnpm install` writes: one line per `package.json`, so two
 * changes to different manifests conflict in the lockfile.
 */
const lockfileFor = Effect.fn('lockfileFor')(function* (workspace: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifests = yield* Effect.forEach(
    ['package.json', 'a/package.json'],
    (file) =>
      fs
        .exists(path.join(workspace, file))
        .pipe(
          Effect.flatMap((exists) =>
            exists
              ? fs.readFileString(path.join(workspace, file))
              : Effect.succeed('none\n'),
          ),
        ),
  );
  return manifests.join('');
});

/** A `v12` remote with a `next/` workspace, and `clone` for each agent. */
const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const remote = path.join(root, 'remote.git');
  yield* git(root, 'init', '--quiet', '--bare', '--initial-branch=v12', remote);

  const seed = path.join(root, 'seed');
  yield* fs.makeDirectory(seed);
  yield* git(seed, 'init', '--quiet', '--initial-branch=v12');
  yield* identify(seed);
  yield* write(seed, 'next/package.json', '{"name":"root"}\n');
  yield* write(seed, 'next/a.ts', 'export const a = 1;\n');
  yield* write(
    seed,
    'next/pnpm-lock.yaml',
    yield* lockfileFor(path.join(seed, 'next')),
  );
  yield* commit(seed, 'seed');
  yield* git(seed, 'push', '--quiet', remote, 'v12');

  const clone = Effect.fn('clone')(function* (name: string) {
    const dir = path.join(root, name);
    yield* git(root, 'clone', '--quiet', remote, dir);
    yield* identify(dir);
    return dir;
  });
  const history = git(remote, 'log', '--format=%s', 'v12').pipe(
    Effect.map(lines),
  );
  return { clone, history };
});

/** Records what `land` ran; `install` writes {@link lockfileFor}'s lockfile. */
const recording = () => {
  const installs: Array<string> = [];
  const checks: Array<ReadonlyArray<string>> = [];
  const steps = {
    install: (dir: string) =>
      Effect.gen(function* () {
        installs.push(dir);
        yield* write(dir, 'pnpm-lock.yaml', yield* lockfileFor(dir));
      }),
    check: (_dir: string, files: ReadonlyArray<string>) =>
      Effect.sync(() => checks.push(files)),
  } satisfies Steps<FileSystem.FileSystem | Path.Path, PlatformError>;
  return { installs, checks, steps };
};

const pushed = Effect.fn('pushed')(function* (
  dir: string,
  file: string,
  contents: string,
) {
  yield* write(dir, file, contents);
  yield* commit(dir, file);
  yield* git(dir, 'push', '--quiet', 'origin', 'HEAD:v12');
});

describe('land', () => {
  it.effect(
    'rebases onto the moved branch, checks the changed files and pushes',
    () =>
      Effect.gen(function* () {
        const repo = yield* setup;
        const a = yield* repo.clone('a');
        const b = yield* repo.clone('b');
        yield* pushed(b, 'next/b.ts', 'export const b = 1;\n');
        yield* write(a, 'next/src/x.ts', 'export const x = 1;\n');
        yield* write(a, 'README.md', 'outside the workspace\n');
        yield* commit(a, 'x');

        const run = recording();
        yield* land(a, target, run.steps);

        assert.deepStrictEqual(yield* repo.history, ['x', 'next/b.ts', 'seed']);
        assert.deepStrictEqual(run.checks, [['src/x.ts']]);
        assert.deepStrictEqual(run.installs, []);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('reinstalls when the rebase brings in a package.json change', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      const b = yield* repo.clone('b');
      yield* write(b, 'next/package.json', '{"name":"root","private":true}\n');
      yield* write(
        b,
        'next/pnpm-lock.yaml',
        yield* lockfileFor(path.join(b, 'next')),
      );
      yield* commit(b, 'private');
      yield* git(b, 'push', '--quiet', 'origin', 'v12');
      yield* write(a, 'next/x.ts', 'export const x = 1;\n');
      yield* commit(a, 'x');

      const run = recording();
      yield* land(a, target, run.steps);

      assert.deepStrictEqual(run.installs, [path.join(a, 'next')]);
      assert.deepStrictEqual(yield* repo.history, ['x', 'private', 'seed']);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "takes the branch's lockfile on a lockfile conflict and reinstalls",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const repo = yield* setup;
        const a = yield* repo.clone('a');
        const b = yield* repo.clone('b');
        yield* write(
          b,
          'next/package.json',
          '{"name":"root","private":true}\n',
        );
        yield* write(
          b,
          'next/pnpm-lock.yaml',
          yield* lockfileFor(path.join(b, 'next')),
        );
        yield* commit(b, 'private');
        yield* git(b, 'push', '--quiet', 'origin', 'v12');
        yield* write(a, 'next/a/package.json', '{"name":"a"}\n');
        yield* write(
          a,
          'next/pnpm-lock.yaml',
          yield* lockfileFor(path.join(a, 'next')),
        );
        yield* commit(a, 'add a');

        const run = recording();
        yield* land(a, target, run.steps);

        assert.deepStrictEqual(yield* repo.history, [
          'add a',
          'private',
          'seed',
        ]);
        const fs = yield* FileSystem.FileSystem;
        assert.strictEqual(
          yield* git(a, 'show', 'origin/v12:next/pnpm-lock.yaml'),
          (yield* lockfileFor(path.join(a, 'next'))).trim(),
        );
        assert.include(
          yield* fs.readFileString(path.join(a, 'next/pnpm-lock.yaml')),
          '"private":true',
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('stops on any other conflict, mid-rebase, without pushing', () =>
    Effect.gen(function* () {
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      const b = yield* repo.clone('b');
      yield* pushed(b, 'next/a.ts', 'export const a = 2;\n');
      yield* write(a, 'next/a.ts', 'export const a = 3;\n');
      yield* commit(a, 'three');

      const error = yield* land(a, target, recording().steps).pipe(Effect.flip);

      assert.isTrue(Predicate.isTagged(error, 'LandError'));
      assert.include(error.message, 'next/a.ts');
      assert.deepStrictEqual(yield* repo.history, ['next/a.ts', 'seed']);
      const again = yield* land(a, target, recording().steps).pipe(Effect.flip);
      assert.include(again.message, 'A rebase is in progress');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('rebases and checks again when the push is rejected', () =>
    Effect.gen(function* () {
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      const b = yield* repo.clone('b');
      yield* write(a, 'next/x.ts', 'export const x = 1;\n');
      yield* commit(a, 'x');

      const run = recording();
      yield* land(a, target, {
        ...run.steps,
        // Another agent lands while this one checks.
        check: (dir, files) =>
          run.steps
            .check(dir, files)
            .pipe(
              Effect.andThen(() =>
                run.checks.length === 1
                  ? pushed(b, 'next/b.ts', 'export const b = 1;\n')
                  : Effect.void,
              ),
            ),
      });

      assert.strictEqual(run.checks.length, 2);
      assert.deepStrictEqual(yield* repo.history, ['x', 'next/b.ts', 'seed']);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("doesn't push when the check fails", () =>
    Effect.gen(function* () {
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      yield* write(a, 'next/x.ts', 'export const x = ;\n');
      yield* commit(a, 'broken');

      const error = yield* land(a, target, {
        ...recording().steps,
        check: () => Effect.fail('lint'),
      }).pipe(Effect.flip);

      assert.isTrue(Predicate.isTagged(error, 'LandError'));
      assert.deepStrictEqual(yield* repo.history, ['seed']);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('refuses uncommitted changes', () =>
    Effect.gen(function* () {
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      yield* write(a, 'next/a.ts', 'export const a = 2;\n');

      const error = yield* land(a, target, recording().steps).pipe(Effect.flip);

      assert.include(error.message, 'git stash');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('does nothing when HEAD is already on the branch', () =>
    Effect.gen(function* () {
      const repo = yield* setup;
      const a = yield* repo.clone('a');
      const run = recording();
      yield* land(a, target, run.steps);
      assert.deepStrictEqual(run.checks, []);
      assert.deepStrictEqual(yield* repo.history, ['seed']);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
