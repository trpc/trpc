import { NodeServices } from '@effect/platform-node';
import { assert, describe, it } from '@effect/vitest';
import { Effect, Path } from 'effect';

import { repo, workspace, writeTree } from './testing.ts';
import { dependencyDirs, workspaceGlobs, workspaceRoot } from './workspace.ts';

describe('workspaceGlobs', () => {
  it('reads the quoted and bare `packages` entries', () => {
    assert.deepStrictEqual(workspaceGlobs(workspace['pnpm-workspace.yaml']), [
      'apps/*',
      'libs/*',
    ]);
  });
});

describe('workspaceRoot', () => {
  it.effect('finds the workspace above a project, below the repo', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = yield* writeTree(repo);
      assert.strictEqual(
        yield* workspaceRoot(path.join(root, 'next/apps/web')),
        path.join(root, 'next'),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('fails outside any workspace', () =>
    Effect.gen(function* () {
      const root = yield* writeTree({ 'package.json': '{}' });
      const error = yield* Effect.flip(workspaceRoot(root));
      assert.strictEqual(error._tag, 'WorkspaceError');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe('dependencyDirs', () => {
  it.effect('follows `workspace:` dependencies transitively', () =>
    Effect.gen(function* () {
      const root = yield* writeTree(workspace);
      const dirs = yield* dependencyDirs(root, 'apps/web');
      assert.deepStrictEqual([...dirs].sort(), [
        'apps/web',
        'libs/a',
        'libs/b',
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('fails on an unreadable manifest', () =>
    Effect.gen(function* () {
      const root = yield* writeTree({
        ...workspace,
        'libs/a/package.json': '{',
      });
      const error = yield* Effect.flip(dependencyDirs(root, 'apps/web'));
      assert.strictEqual(error._tag, 'SchemaError');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
