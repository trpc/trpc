import { Effect, FileSystem, Path } from 'effect';

/**
 * The apps the docs' code blocks compile in: each folder of `samplesDir` is
 * a workspace package with its own `tsconfig.json`.
 */
export const sampleApps = Effect.fn('sampleApps')(function* (
  samplesDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configs = yield* fs.glob('*/tsconfig.json', { root: samplesDir });
  return configs
    .map((file) => path.join(samplesDir, path.dirname(file)))
    .toSorted();
});

/** The app of `apps` (from `sampleApps`) that holds `file`. */
export function appOf(
  path: Path.Path,
  file: string,
  apps: ReadonlyArray<string>,
): string | undefined {
  return apps.find((app) => file.startsWith(`${app}${path.sep}`));
}
