import { Effect, FileSystem, Path } from 'effect';

/**
 * The folders under `packages/` that are packages, as pnpm sees them: the
 * ones with a `package.json`. An old checkout keeps ignored leftovers of
 * renamed packages (`dist/` and `node_modules/` only), which aren't.
 */
export const packageDirs = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(root, 'packages');
    const names = (yield* fs.readDirectory(dir)).sort();
    return yield* Effect.filter(names, (name) =>
      fs.exists(path.join(dir, name, 'package.json')),
    );
  });
