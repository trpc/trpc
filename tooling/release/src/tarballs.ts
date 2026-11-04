/**
 * A release packs its packages in one job and publishes the tarballs from
 * another, which holds the credentials and runs nothing from the packages.
 * That job publishes only the packages, versions and commit it works out
 * itself.
 */
import { Data, Effect, FileSystem, Path } from 'effect';
import { git, output, run } from './command.ts';
import type { PackageJson } from './version.ts';
import { readPackages } from './workspace.ts';

export class TarballError extends Data.TaggedError('TarballError')<{
  readonly message: string;
}> {}

/** `@trpc/server`, `11.23.0` → `trpc-server-11.23.0.tgz`. */
export function tarballName(name: string, version: string) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

export interface Tarball {
  readonly name: string;
  readonly version: string;
  readonly file: string;
}

/**
 * Next to the tarballs, the commit they were packed from. Two commits can
 * release the same versions, e.g. after `main` moved.
 */
const commitFile = 'commit';

/**
 * Packs each package in `versions`, already at its version, into `dir`, and
 * notes HEAD there. `pnpm pack` turns `workspace:` ranges into versions, as
 * `pnpm publish` does.
 */
export const packTarballs = Effect.fn('packTarballs')(function* (
  root: string,
  versions: ReadonlyMap<string, string>,
  dir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(dir, { recursive: true });
  for (const { dir: packageDir, name } of yield* readPackages(root)) {
    const version = versions.get(name);
    if (version !== undefined) {
      yield* run(path.join(root, packageDir), 'pnpm', [
        'pack',
        '--out',
        path.join(dir, tarballName(name, version)),
      ]);
    }
  }
  yield* fs.writeFileString(
    path.join(dir, commitFile),
    `${yield* git(root, 'rev-parse', 'HEAD')}\n`,
  );
});

/**
 * The tarballs in `dir`, in `versions`' order. `dir` must hold exactly one
 * for each package in `versions`, each must be that package at that version,
 * and they must be packed from `root`'s HEAD.
 */
export const readTarballs = Effect.fn('readTarballs')(function* (
  root: string,
  dir: string,
  versions: ReadonlyMap<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tarballs: Array<Tarball> = [...versions].map(([name, version]) => ({
    name,
    version,
    file: path.join(dir, tarballName(name, version)),
  }));
  const expected = [
    ...tarballs.map(({ file }) => path.basename(file)),
    commitFile,
  ];
  const found = yield* fs.readDirectory(dir);
  const missing = expected.filter((file) => !found.includes(file));
  const unexpected = found.filter((file) => !expected.includes(file)).sort();
  if (missing.length > 0 || unexpected.length > 0) {
    return yield* new TarballError({
      message: `${dir} doesn't hold the tarballs of this release. Missing: ${missing.join(', ') || 'none'}. Not part of it: ${unexpected.join(', ') || 'none'}.`,
    });
  }
  const packedFrom = (yield* fs.readFileString(
    path.join(dir, commitFile),
  )).trim();
  const head = yield* git(root, 'rev-parse', 'HEAD');
  if (packedFrom !== head) {
    return yield* new TarballError({
      message: `The tarballs in ${dir} are packed from ${packedFrom}, but HEAD is ${head}`,
    });
  }
  for (const { name, version, file } of tarballs) {
    const pkg = JSON.parse(
      yield* output(dir, 'tar', [
        '-xzOf',
        path.basename(file),
        'package/package.json',
      ]),
    ) as PackageJson;
    if (pkg.name !== name || pkg.version !== version) {
      return yield* new TarballError({
        message: `${file} is ${pkg.name}@${pkg.version}, not ${name}@${version}`,
      });
    }
  }
  return tarballs;
});

/** Whether `registry` lists `version` of `name`. */
export const onRegistry = Effect.fn('onRegistry')(function* (
  registry: string,
  name: string,
  version: string,
) {
  const url = `${registry.replace(/\/$/, '')}/${name.replace('/', '%2f')}`;
  const packument = yield* Effect.tryPromise(async () => {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
    return response.ok
      ? ((await response.json()) as { versions?: Record<string, unknown> })
      : undefined;
  }).pipe(Effect.orElseSucceed(() => undefined));
  return packument?.versions?.[version] !== undefined;
});
