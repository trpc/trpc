/**
 * A package's `build` script: `vp pack` over every `exports` entry, as
 * unbundled ESM with declarations in `dist/`. In the workspace, `exports`
 * point at `src/`; `publishConfig.exports` points at the build output and
 * must list the same subpaths. Run from the package directory.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** Conditions to files; `types` and `default` are required. */
type Entry = Readonly<Record<string, string>> & {
  readonly types: string;
  readonly default: string;
};
export interface PackageJson {
  readonly name: string;
  readonly exports: Record<string, Entry>;
  readonly publishConfig?: {
    readonly access?: string;
    readonly exports?: Record<string, Entry>;
  };
}

export class InvalidExports extends Data.TaggedError('InvalidExports')<{
  readonly message: string;
}> {}

class PackFailed extends Data.TaggedError('PackFailed')<{
  readonly exitCode: number;
}> {}

const built = (condition: string, source: string) =>
  source
    .replace(/^\.\/src\//, './dist/')
    .replace(/\.ts$/, condition === 'types' ? '.d.ts' : '.js');

/** Checks that `publishConfig.exports` mirrors `exports` with built paths. */
export const checkExports = (
  pkg: PackageJson,
): Effect.Effect<void, InvalidExports> =>
  Effect.gen(function* () {
    const published = pkg.publishConfig?.exports ?? {};
    for (const [subpath, entry] of Object.entries(pkg.exports)) {
      const expected = Object.fromEntries(
        Object.entries(entry).map(([condition, file]) => [
          condition,
          built(condition, file),
        ]),
      );
      if (JSON.stringify(published[subpath]) !== JSON.stringify(expected)) {
        return yield* new InvalidExports({
          message: `${pkg.name}: publishConfig.exports["${subpath}"] must be ${JSON.stringify(expected)}`,
        });
      }
    }
    for (const subpath of Object.keys(published)) {
      if (!(subpath in pkg.exports)) {
        return yield* new InvalidExports({
          message: `${pkg.name}: publishConfig.exports["${subpath}"] is not in exports`,
        });
      }
    }
  });

const pack = (extraArgs: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pkg = JSON.parse(
      yield* fs.readFileString('package.json'),
    ) as PackageJson;
    yield* checkExports(pkg);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(
        'vp',
        [
          'pack',
          '--no-config',
          ...Object.values(pkg.exports).map((entry) => entry.default),
          '--dts',
          '--unbundle',
          '--platform',
          'neutral',
          '--logLevel',
          'warn',
          ...extraArgs,
        ],
        { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
      ),
    );
    if (exitCode !== 0) return yield* new PackFailed({ exitCode });
  });

if (import.meta.main) {
  pack(process.argv.slice(2)).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
