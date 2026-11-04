import { Data, Effect, FileSystem, Path } from 'effect';
import { packageVersion, withVersions, type PackageJson } from './version.ts';

export class WorkspaceError extends Data.TaggedError('WorkspaceError')<{
  readonly message: string;
}> {}

export interface WorkspacePackage {
  /** Relative to the repo root, e.g. `packages/server`. */
  readonly dir: string;
  readonly name: string;
  readonly pkg: PackageJson;
}

/** The packages in `packages/*`, private ones included. */
export const readPackages = Effect.fn('readPackages')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packages: Array<WorkspacePackage> = [];
  for (const entry of (yield* fs.readDirectory(
    path.join(root, 'packages'),
  )).sort()) {
    const file = path.join(root, 'packages', entry, 'package.json');
    if (entry.startsWith('.') || !(yield* fs.exists(file))) {
      continue;
    }
    const pkg = JSON.parse(yield* fs.readFileString(file)) as PackageJson;
    if (pkg.name === undefined) {
      return yield* new WorkspaceError({ message: `${file} has no name` });
    }
    packages.push({ dir: `packages/${entry}`, name: pkg.name, pkg });
  }
  return packages;
});

/** Each package's version when the workspace is released as `version`. */
export function releaseVersions(
  packages: ReadonlyArray<WorkspacePackage>,
  version: string,
): ReadonlyMap<string, string> {
  return new Map(
    packages.map(({ name }) => [name, packageVersion(name, version)]),
  );
}

const runtimeDependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

/**
 * The public packages and their versions when the workspace is released as
 * `version`, each after the packages it depends on, the order `pnpm publish
 * -r` publishes them in: a package is never on npm before what it needs.
 */
export function publishedVersions(
  packages: ReadonlyArray<WorkspacePackage>,
  version: string,
): ReadonlyMap<string, string> {
  const byName = new Map(
    packages
      .filter(({ pkg }) => pkg.private !== true)
      .map((workspacePackage) => [workspacePackage.name, workspacePackage]),
  );
  const ordered = new Map<string, string>();
  const visiting = new Set<string>();
  const visit = (name: string) => {
    const workspacePackage = byName.get(name);
    if (
      workspacePackage === undefined ||
      ordered.has(name) ||
      visiting.has(name)
    ) {
      return;
    }
    visiting.add(name);
    for (const field of runtimeDependencyFields) {
      const deps = workspacePackage.pkg[field] as
        | Record<string, string>
        | undefined;
      Object.keys(deps ?? {}).forEach(visit);
    }
    ordered.set(name, packageVersion(name, version));
  };
  [...byName.keys()].forEach(visit);
  return ordered;
}

/**
 * Sets every package in `packages/*` to `version` (`@trpc/openapi` gets its
 * prerelease suffix), pinning their peer dependencies on each other. Their
 * other dependencies on each other are `workspace:*`, so `pnpm-lock.yaml`
 * doesn't change. Returns the files it changed, the versions it gives each
 * package, and the published ones in `publishedVersions` order.
 */
export const writeVersions = Effect.fn('writeVersions')(function* (
  root: string,
  version: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packages = yield* readPackages(root);
  const versions = releaseVersions(packages, version);
  const files: Array<string> = [];
  for (const { dir, pkg } of packages) {
    const file = `${dir}/package.json`;
    yield* fs.writeFileString(
      path.join(root, file),
      `${JSON.stringify(withVersions(pkg, versions), null, 2)}\n`,
    );
    files.push(file);
  }
  return { files, versions, published: publishedVersions(packages, version) };
});
