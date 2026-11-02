/**
 * Releases the packages in `packages/*`, the way KATT/raf-query does: the
 * latest `vX.Y.Z` tag is the version, packages are published before anything
 * is pushed, and a stable release ends with a GitHub release whose notes
 * GitHub generates. `pnpm publish -r` publishes each package once, in
 * dependency order, skipping private packages and versions already on npm.
 */
import { Console, Data, Duration, Effect } from 'effect';
import { git, output, run } from './command.ts';
import {
  bumpVersion,
  canaryVersion,
  type Bump,
  type PackageJson,
} from './version.ts';
import { writeVersions } from './workspace.ts';

export class ReleaseError extends Data.TaggedError('ReleaseError')<{
  readonly message: string;
}> {}

/** Commit message of a release commit, which CI checks in full on `main`. */
export const releaseCommitMessage = (tag: string) => `chore: release ${tag}`;

/** The latest stable release tag on `ref`'s first-parent history. */
export const latestTag = Effect.fn('latestTag')(function* (
  root: string,
  ref?: string,
) {
  return yield* git(
    root,
    'describe',
    '--tags',
    '--abbrev=0',
    '--first-parent',
    '--match',
    'v[0-9]*.[0-9]*.[0-9]*',
    '--exclude',
    'v*-*',
    ref ?? 'HEAD',
  );
});

const ensureClean = Effect.fn('ensureClean')(function* (root: string) {
  const status = yield* git(root, 'status', '--porcelain');
  if (status !== '') {
    return yield* new ReleaseError({
      message: `The working tree has changes:\n${status}`,
    });
  }
});

/**
 * Whether `branch` on `remote` is still HEAD. If it moved, the version just
 * written misses commits, and pushing the release commit would be rejected
 * after the packages are on npm.
 */
export const branchMoved = Effect.fn('branchMoved')(function* (
  root: string,
  remote: string,
  branch: string,
) {
  yield* git(root, 'fetch', '--quiet', '--no-tags', remote, branch);
  const [fetched, head] = [
    yield* git(root, 'rev-parse', 'FETCH_HEAD'),
    yield* git(root, 'rev-parse', 'HEAD'),
  ];
  return fetched !== head;
});

/**
 * Checks the release changes nothing but `files`, the version bump. The
 * packages depend on each other with `workspace:*`, so `pnpm-lock.yaml` stays
 * as it is, and pnpm must accept it for the bumped manifests without
 * resolving anything (`--frozen-lockfile`). v11.23.0's lockfile
 * sync re-resolved vitest and broke typecheck on main, so typecheck runs
 * here too, before anything is published or pushed.
 */
export const checkRelease = Effect.fn('checkRelease')(function* (
  root: string,
  files: ReadonlyArray<string>,
) {
  const changed = Effect.fn('changed')(function* () {
    const names = [
      yield* git(root, 'diff', '--name-only', 'HEAD'),
      yield* git(root, 'ls-files', '--others', '--exclude-standard'),
    ].join('\n');
    return names
      .split('\n')
      .filter((file) => file !== '' && !files.includes(file));
  });
  const fail = (what: string, others: ReadonlyArray<string>) =>
    new ReleaseError({
      message: `${what} changed files other than the version bump: ${others.join(', ')}`,
    });

  const others = yield* changed();
  if (others.length > 0) {
    return yield* fail('Versioning', others);
  }
  yield* run(root, 'pnpm', [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
  ]).pipe(
    Effect.mapError(
      () =>
        new ReleaseError({
          message:
            "pnpm doesn't accept pnpm-lock.yaml for the bumped package.json files; fix the lockfile on main, then release again",
        }),
    ),
  );
  const afterInstall = yield* changed();
  if (afterInstall.length > 0) {
    return yield* fail('pnpm install', afterInstall);
  }
  yield* run(root, 'pnpm', ['typecheck-packages']);
});

export interface PublishOptions {
  readonly distTag: string;
  readonly dryRun: boolean;
  readonly provenance: boolean;
}

const publish = Effect.fn('publish')(function* (
  root: string,
  opts: PublishOptions,
) {
  yield* run(root, 'pnpm', [
    'publish',
    '--recursive',
    '--filter',
    './packages/*',
    '--tag',
    opts.distTag,
    '--no-git-checks',
    ...(opts.provenance ? ['--provenance'] : []),
    ...(opts.dryRun ? ['--dry-run'] : []),
  ]);
});

export interface WaitOptions {
  readonly timeout: Duration.Duration;
  readonly interval: Duration.Duration;
}

export const defaultWait: WaitOptions = {
  timeout: Duration.minutes(30),
  interval: Duration.seconds(15),
};

/** `@trpc/server`, `11.23.0` → its tarball's URL on `registry`. */
export function tarballUrl(registry: string, name: string, version: string) {
  const basename = name.slice(name.lastIndexOf('/') + 1);
  return `${registry.replace(/\/$/, '')}/${name}/-/${basename}-${version}.tgz`;
}

/** The registry pnpm publishes to. */
const publishRegistry = (root: string) =>
  output(root, 'pnpm', ['config', 'get', 'registry']);

/**
 * Waits until `registry` serves every version in `versions`. A successful
 * publish only means npm accepted it: npm scans each version before anyone
 * can install it, which takes minutes and sometimes hours, and it can hold or
 * block a version instead.
 */
export const waitForVersions = Effect.fn('waitForVersions')(function* (
  versions: ReadonlyMap<string, string>,
  registry: string,
  opts: WaitOptions,
) {
  const pending = new Map(versions);
  const deadline = Date.now() + Duration.toMillis(opts.timeout);
  while (pending.size > 0) {
    for (const [name, version] of pending) {
      const response = yield* Effect.tryPromise(() =>
        fetch(tarballUrl(registry, name, version), { method: 'HEAD' }),
      ).pipe(Effect.orElseSucceed(() => undefined));
      if (response?.ok) {
        pending.delete(name);
        yield* Console.log(`${name}@${version} is on npm`);
      }
    }
    if (pending.size === 0) {
      break;
    }
    if (Date.now() >= deadline) {
      const list = [...pending].map(([name, version]) => `${name}@${version}`);
      return yield* new ReleaseError({
        message: `npm accepted these but doesn't serve them yet: ${list.join(', ')}`,
      });
    }
    yield* Effect.sleep(opts.interval);
  }
});

/**
 * Creates the GitHub release for `tag` once npm serves `versions`, with notes
 * GitHub generates from the pull requests since `previousTag`.
 */
export const githubRelease = Effect.fn('githubRelease')(function* (
  root: string,
  opts: { readonly tag: string; readonly previousTag: string },
) {
  yield* run(root, 'gh', [
    'release',
    'create',
    opts.tag,
    '--verify-tag',
    '--title',
    opts.tag,
    '--generate-notes',
    '--notes-start-tag',
    opts.previousTag,
  ]);
});

export interface StableOptions extends PublishOptions {
  readonly bump: Bump;
  readonly remote: string;
  readonly branch: string;
  readonly wait: WaitOptions;
}

/**
 * Bumps every package from the latest tag, checks the bump (`checkRelease`),
 * builds and publishes, then commits, tags and pushes the release and
 * creates its GitHub release. Stops before publishing if `branch` moved since checkout,
 * so a push can't be rejected after the packages are out.
 */
export const stable = Effect.fn('stable')(function* (
  root: string,
  opts: StableOptions,
) {
  yield* ensureClean(root);
  const previousTag = yield* latestTag(root);
  const version = bumpVersion(previousTag.slice(1), opts.bump);
  const tag = `v${version}`;
  yield* Console.log(`Releasing ${tag} (${opts.bump} after ${previousTag})`);

  const { files, published } = yield* writeVersions(root, version);
  yield* checkRelease(root, files);
  yield* run(root, 'pnpm', ['build']);

  if (yield* branchMoved(root, opts.remote, opts.branch)) {
    const message = `${opts.branch} moved since this run checked it out; release again from the new ${opts.branch}`;
    if (!opts.dryRun) {
      return yield* new ReleaseError({ message });
    }
    yield* Console.log(
      `Dry run: HEAD isn't ${opts.remote}/${opts.branch}, so a real run would stop here: ${message}`,
    );
  }
  yield* publish(root, opts);
  if (opts.dryRun) {
    yield* Console.log(
      `Dry run: would commit "${releaseCommitMessage(tag)}", tag ${tag}, push both to ${opts.remote} ${opts.branch} and create the GitHub release. The version bump is left in the working tree.`,
    );
    return tag;
  }

  yield* git(root, 'add', '--', ...files);
  yield* git(root, 'commit', '--quiet', '--message', releaseCommitMessage(tag));
  yield* git(root, 'tag', '--annotate', tag, '--message', tag);
  yield* git(
    root,
    'push',
    '--atomic',
    opts.remote,
    `HEAD:refs/heads/${opts.branch}`,
    `refs/tags/${tag}`,
  );

  yield* waitForVersions(
    published,
    yield* publishRegistry(root),
    opts.wait,
  ).pipe(
    Effect.mapError(
      (error) =>
        new ReleaseError({
          message: `${error.message}. ${tag} is pushed. Once npm serves them, create the GitHub release: pnpm release github-release ${tag}`,
        }),
    ),
  );
  yield* githubRelease(root, { tag, previousTag });
  return tag;
});

export interface CanaryOptions extends PublishOptions {
  readonly preid: string;
}

/**
 * Publishes HEAD as `11.22.2-canary.42.d3cd94bdd`: the patch after the latest
 * tag, the number of commits since it, and HEAD's short sha. Nothing is
 * committed or pushed.
 */
export const canary = Effect.fn('canary')(function* (
  root: string,
  opts: CanaryOptions,
) {
  const tag = yield* latestTag(root);
  const commits = Number(
    yield* git(root, 'rev-list', '--count', `${tag}..HEAD`),
  );
  const sha = yield* git(root, 'rev-parse', '--short=9', 'HEAD');
  const version = canaryVersion({
    version: tag.slice(1),
    commits,
    sha,
    preid: opts.preid,
  });
  yield* Console.log(`Publishing ${version} as ${opts.distTag}`);
  yield* writeVersions(root, version);
  yield* run(root, 'pnpm', ['build']);
  yield* publish(root, opts);
  return version;
});

/**
 * `pnpm release github-release v11.23.0`, for a stable release whose GitHub
 * release wasn't created: waits for its packages, then creates it.
 */
export const githubReleaseForTag = Effect.fn('githubReleaseForTag')(function* (
  root: string,
  tag: string,
  wait: WaitOptions,
) {
  const previousTag = yield* latestTag(root, `${tag}^`);
  const dirs = yield* git(root, 'ls-tree', '--name-only', `${tag}:packages`);
  const versions = new Map<string, string>();
  for (const dir of dirs.split('\n')) {
    const raw = yield* git(
      root,
      'show',
      `${tag}:packages/${dir}/package.json`,
    ).pipe(Effect.orElseSucceed(() => undefined));
    const pkg =
      raw === undefined ? undefined : (JSON.parse(raw) as PackageJson);
    if (pkg?.name !== undefined && pkg.version !== undefined && !pkg.private) {
      versions.set(pkg.name, pkg.version);
    }
  }
  yield* waitForVersions(versions, yield* publishRegistry(root), wait);
  yield* githubRelease(root, { tag, previousTag });
});
