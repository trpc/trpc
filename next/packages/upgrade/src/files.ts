import { Effect, FileSystem, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { upgradeSource, type UpgradeNote } from './transform.ts';

const SOURCE = /\.[cm]?[jt]sx?$/;
const SKIP = new Set(['node_modules', 'dist', '.git', '.next', '.output']);

/**
 * One file {@link upgradeFiles} looked at.
 * @since 0.1.0
 * @stability stable
 */
export interface FileUpgrade {
  readonly path: string;
  readonly changed: boolean;
  readonly notes: ReadonlyArray<UpgradeNote>;
}

const sourceFiles = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): Effect.Effect<ReadonlyArray<string>, PlatformError> =>
  Effect.gen(function* () {
    const info = yield* fs.stat(root);
    if (info.type !== 'Directory') return [root];
    const entries = yield* fs.readDirectory(root);
    const nested = yield* Effect.forEach(
      entries.filter((entry) => !SKIP.has(entry)),
      (entry) => {
        const full = path.join(root, entry);
        return fs
          .stat(full)
          .pipe(
            Effect.flatMap((child) =>
              child.type === 'Directory'
                ? sourceFiles(fs, path, full)
                : Effect.succeed(SOURCE.test(entry) ? [full] : []),
            ),
          );
      },
    );
    return nested.flat();
  });

/**
 * Runs {@link upgradeSource} over files and directories (skipping
 * `node_modules`, `dist` and `.git`), writing the results when `write`
 * is set.
 *
 * @example
 * ```ts
 * const results = yield* upgradeFiles(['src'], { write: true });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const upgradeFiles = (
  paths: ReadonlyArray<string>,
  opts: { readonly write: boolean },
): Effect.Effect<
  ReadonlyArray<FileUpgrade>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = yield* Effect.forEach(paths, (root) =>
      sourceFiles(fs, path, root),
    );
    return yield* Effect.forEach(
      [...new Set(files.flat())].sort(),
      (file) =>
        Effect.gen(function* () {
          const source = yield* fs.readFileString(file);
          const result = upgradeSource(source, file);
          if (opts.write && result.changed) {
            yield* fs.writeFileString(file, result.code);
          }
          return { path: file, changed: result.changed, notes: result.notes };
        }),
      { concurrency: 8 },
    );
  }).pipe(Effect.withSpan('trpc.upgradeFiles'));
