import { Data } from 'effect';

export class VersionError extends Data.TaggedError('VersionError')<{
  readonly message: string;
}> {}

export const bumps = ['patch', 'minor', 'major'] as const;
export type Bump = (typeof bumps)[number];

export function isBump(value: string): value is Bump {
  return (bumps as ReadonlyArray<string>).includes(value);
}

function parse(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new VersionError({ message: `${version} is not x.y.z` });
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

/** `11.22.1` → `11.22.2` (patch), `11.23.0` (minor) or `12.0.0` (major). */
export function bumpVersion(version: string, bump: Bump) {
  const [major, minor, patch] = parse(version);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * The canary for the commit `sha`, `commits` commits after the release
 * `version`: `11.22.1` → `11.22.2-canary.42.gd3cd94bdd`. npm drops `+build`
 * metadata, so the sha goes in the prerelease, after a `g` as in
 * `git describe`: an all-digit sha like `012345678` is a numeric identifier
 * with a leading zero, which semver rejects.
 */
export function canaryVersion(opts: {
  readonly version: string;
  readonly commits: number;
  readonly sha: string;
  readonly preid: string;
}) {
  const next = bumpVersion(opts.version, 'patch');
  return `${next}-${opts.preid}.${opts.commits}.g${opts.sha}`;
}

/** Packages that stay on a prerelease, with their prerelease id. */
export const prereleasePackages: ReadonlyMap<string, string> = new Map([
  ['@trpc/openapi', 'alpha'],
]);

/** `@trpc/openapi` gets `11.23.0-alpha`; canaries are prereleases already. */
export function packageVersion(name: string, version: string) {
  const preid = prereleasePackages.get(name);
  return preid === undefined || version.includes('-')
    ? version
    : `${version}-${preid}`;
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly files?: ReadonlyArray<string>;
  readonly [field: string]: unknown;
}

/**
 * `pkg` at its version in `versions`, depending on exactly the versions in
 * `versions` of the packages released with it. `workspace:` ranges stay:
 * `pnpm publish` turns them into the version it publishes.
 */
export function withVersions(
  pkg: PackageJson,
  versions: ReadonlyMap<string, string>,
): PackageJson {
  const result: Record<string, unknown> = { ...pkg };
  const own = pkg.name === undefined ? undefined : versions.get(pkg.name);
  if (own !== undefined) {
    result['version'] = own;
  }
  for (const field of dependencyFields) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (deps === undefined) {
      continue;
    }
    result[field] = Object.fromEntries(
      Object.entries(deps).map(([name, range]) => [
        name,
        range.startsWith('workspace:') ? range : (versions.get(name) ?? range),
      ]),
    );
  }
  return result;
}
