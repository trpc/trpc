import { NodeServices } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem, Layer, Path } from 'effect';

import { decide, git } from './decide.ts';
import { repo, writeTree } from './testing.ts';

const commit = Effect.fn('commit')(function* (root: string, message: string) {
  yield* git(root, 'add', '--all');
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
    '--message',
    message,
  );
  return yield* git(root, 'rev-parse', 'HEAD');
});

/** {@link repo} committed on `v12`, then checked out on `feature`. */
const setup = Effect.gen(function* () {
  const root = yield* writeTree(repo);
  yield* git(root, 'init', '--quiet', '--initial-branch', 'v12');
  const production = yield* commit(root, 'v12');
  yield* git(root, 'checkout', '--quiet', '-b', 'feature');
  return { production, root };
});

/** Appends to `file`, relative to the repository, and commits. */
const touch = Effect.fn('touch')(function* (root: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(root, file), '# changed\n', {
    flag: 'a',
  });
  return yield* commit(root, `touch ${file}`);
});

const run = (env: Record<string, string>) =>
  Effect.provide(
    Layer.merge(
      NodeServices.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown(env)),
    ),
  );

/** Decides for `project`, a directory of the `next/` workspace. */
const decideFor = Effect.fn('decideFor')(function* (
  root: string,
  project: string,
) {
  const path = yield* Path.Path;
  return yield* decide(
    { dir: path.join(root, 'next', project), inputs: ['docs'] },
    { production: 'v12', remote: `file://${root}` },
  );
});

describe('decide', () => {
  it.effect('skips when nothing the project uses changed', () =>
    Effect.gen(function* () {
      const root = (yield* setup).root;
      const previous = yield* touch(root, 'next/apps/web/a.ts');
      yield* touch(root, 'next/libs/c/a.ts');
      yield* touch(root, 'next/apps/other/a.ts');
      yield* touch(root, 'README.md');
      const decision = yield* decideFor(root, 'apps/web').pipe(
        run({
          VERCEL_GIT_COMMIT_REF: 'feature',
          VERCEL_GIT_PREVIOUS_SHA: previous,
        }),
      );
      assert.isFalse(decision.build);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const file of [
    'next/apps/web/a.ts',
    'next/libs/b/a.ts',
    'next/docs/a.md',
    'next/pnpm-workspace.yaml',
    'next/pnpm-lock.yaml',
  ]) {
    it.effect(`builds when ${file} changed`, () =>
      Effect.gen(function* () {
        const commits = yield* setup;
        yield* touch(commits.root, file);
        const decision = yield* decideFor(commits.root, 'apps/web').pipe(
          run({
            VERCEL_GIT_COMMIT_REF: 'feature',
            VERCEL_GIT_PREVIOUS_SHA: commits.production,
          }),
        );
        assert.isTrue(decision.build);
        assert.include(decision.reason, file);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("compares a branch's first deployment with v12", () =>
    Effect.gen(function* () {
      const root = (yield* setup).root;
      yield* touch(root, 'next/libs/b/a.ts');
      const env: Record<string, string> = { VERCEL_GIT_COMMIT_REF: 'feature' };
      assert.isTrue((yield* decideFor(root, 'apps/web').pipe(run(env))).build);
      assert.isFalse(
        (yield* decideFor(root, 'apps/other').pipe(run(env))).build,
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("builds v12's first deployment", () =>
    Effect.gen(function* () {
      const root = (yield* setup).root;
      const decision = yield* decideFor(root, 'apps/web').pipe(
        run({ VERCEL_GIT_COMMIT_REF: 'v12' }),
      );
      assert.isTrue(decision.build);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "fetches the last deployment's commit into a clone too shallow to have it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const origin = yield* setup;
        // GitHub serves any commit by its hash; a local repo only when asked.
        yield* git(
          origin.root,
          'config',
          'uploadpack.allowAnySHA1InWant',
          'true',
        );
        yield* touch(origin.root, 'next/apps/other/a.ts');
        const clone = path.join(yield* fs.makeTempDirectoryScoped(), 'clone');
        yield* git(
          origin.root,
          'clone',
          '--quiet',
          '--depth=1',
          '--branch',
          'feature',
          `file://${origin.root}`,
          clone,
        );
        const decision = yield* decide(
          { dir: path.join(clone, 'next', 'apps/web'), inputs: ['docs'] },
          { production: 'v12', remote: `file://${origin.root}` },
        ).pipe(
          run({
            VERCEL_GIT_COMMIT_REF: 'feature',
            VERCEL_GIT_PREVIOUS_SHA: origin.production,
          }),
        );
        assert.isFalse(decision.build);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('skips when only an ignored file changed', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const commits = yield* setup;
      yield* touch(commits.root, 'next/libs/b/a.test.ts');
      const decideIgnoring = (ignored: ReadonlyArray<string>) =>
        decide(
          {
            dir: path.join(commits.root, 'next', 'apps/web'),
            ignored,
            inputs: ['docs'],
          },
          { production: 'v12', remote: `file://${commits.root}` },
        ).pipe(
          run({
            VERCEL_GIT_COMMIT_REF: 'feature',
            VERCEL_GIT_PREVIOUS_SHA: commits.production,
          }),
        );
      assert.isTrue((yield* decideIgnoring([])).build);
      assert.isFalse((yield* decideIgnoring(['libs/**/*.test.ts'])).build);
      yield* touch(commits.root, 'next/libs/b/a.ts');
      assert.isTrue((yield* decideIgnoring(['libs/**/*.test.ts'])).build);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails when the last deployment's commit is gone", () =>
    Effect.gen(function* () {
      const root = (yield* setup).root;
      const error = yield* Effect.flip(
        decideFor(root, 'apps/web').pipe(
          run({ VERCEL_GIT_PREVIOUS_SHA: '0'.repeat(40) }),
        ),
      );
      assert.strictEqual(error._tag, 'GitError');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
