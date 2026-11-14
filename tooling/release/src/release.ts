/**
 * Releases the packages in `packages/*`, the way KATT/raf-query does: the
 * latest `vX.Y.Z` tag is the version, packages are published before anything
 * is pushed, and a stable release ends with a GitHub release whose notes
 * group the pull requests since the last one by package (`notes.ts`).
 *
 * Each release has two halves (`tarballs.ts`): one builds and packs the
 * packages without credentials, the other publishes the tarballs with them.
 * The publishing half publishes each package once, after the packages it
 * depends on, skipping versions the registry has already.
 */
import { Console, Data, Duration, Effect, FileSystem } from 'effect';
import { git, output, run } from './command.ts';
import { releaseNotes } from './notes.ts';
import {
  onRegistry,
  packTarballs,
  readTarballs,
  type Tarball,
} from './tarballs.ts';
import {
  bumpVersion,
  canaryVersion,
  type Bump,
  type PackageJson,
} from './version.ts';
import { publishedVersions, readPackages, writeVersions } from './workspace.ts';

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
 * Whether `branch` on `remote` has commits HEAD doesn't. If it does, the
 * version just written misses them, and pushing the release commit is
 * rejected. A release commit on top of HEAD doesn't count as moving.
 */
export const branchMoved = Effect.fn('branchMoved')(function* (
  root: string,
  remote: string,
  branch: string,
) {
  yield* git(root, 'fetch', '--quiet', '--no-tags', remote, branch);
  const missing = yield* git(root, 'rev-list', '--count', 'HEAD..FETCH_HEAD');
  return Number(missing) > 0;
});

/** Whether `branch` on `remote` has HEAD, so HEAD holds nothing unmerged. */
const onBranch = Effect.fn('onBranch')(function* (
  root: string,
  remote: string,
  branch: string,
) {
  yield* git(root, 'fetch', '--quiet', '--no-tags', remote, branch);
  return yield* git(
    root,
    'merge-base',
    '--is-ancestor',
    'HEAD',
    'FETCH_HEAD',
  ).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
});

/** Undoes the version bump in `files` if the effect it pipes fails. */
const undoBumpOnFailure = (root: string, files: ReadonlyArray<string>) =>
  Effect.onError(() =>
    git(root, 'checkout', '--quiet', '--', ...files).pipe(Effect.ignore),
  );

/**
 * Checks the release changes nothing but `files`, the version bump. The
 * packages depend on each other with `workspace:*`, so `pnpm-lock.yaml` stays
 * as it is, and pnpm must accept it for the bumped manifests without
 * resolving anything (`--frozen-lockfile`). v11.23.0's lockfile
 * sync re-resolved vitest and broke typecheck on main, so typecheck runs
 * here too, before anything is published or pushed. Then it builds, and
 * checks the tree once more: `pnpm pack` packs the working tree, which must
 * still be the release commit.
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
  yield* run(root, 'pnpm', ['build']);
  const afterBuild = yield* changed();
  if (afterBuild.length > 0) {
    return yield* fail('Typechecking or building', afterBuild);
  }
});

export interface PublishOptions {
  readonly distTag: string;
  readonly dryRun: boolean;
  readonly provenance: boolean;
}

export interface PackOptions {
  /** Where the tarballs go, or come from when publishing. */
  readonly dir: string;
}

const publishTarballs = Effect.fn('publishTarballs')(function* (
  root: string,
  tarballs: ReadonlyArray<Tarball>,
  opts: PublishOptions & { readonly registry: string },
) {
  for (const tarball of tarballs) {
    const { name, version, file } = tarball;
    const state = yield* onRegistry(opts.registry, tarball);
    if (state === 'same') {
      yield* Console.log(`${name}@${version} is on ${opts.registry} already`);
      continue;
    }
    if (state === 'different') {
      return yield* new ReleaseError({
        message: `${name}@${version} on ${opts.registry} isn't what this run packed: a run from another commit published it. Nothing more was published.`,
      });
    }
    yield* run(root, 'pnpm', [
      'publish',
      file,
      '--tag',
      opts.distTag,
      '--no-git-checks',
      ...(opts.provenance ? ['--provenance'] : []),
      ...(opts.dryRun ? ['--dry-run'] : []),
    ]);
  }
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
 * Creates the GitHub release for `tag`, with the notes `releaseNotes` makes
 * from the pull requests since `previousTag`.
 */
export const githubRelease = Effect.fn('githubRelease')(function* (
  root: string,
  opts: { readonly tag: string; readonly previousTag: string },
) {
  const fs = yield* FileSystem.FileSystem;
  const notesFile = yield* fs.makeTempFileScoped({ suffix: '.md' });
  yield* fs.writeFileString(
    notesFile,
    yield* releaseNotes(root, { ...opts, to: opts.tag }),
  );
  yield* run(root, 'gh', [
    'release',
    'create',
    opts.tag,
    '--verify-tag',
    '--title',
    opts.tag,
    '--notes-file',
    notesFile,
  ]);
}, Effect.scoped);

export interface StableOptions extends PublishOptions {
  readonly bump: Bump;
  readonly remote: string;
  readonly branch: string;
  readonly wait: WaitOptions;
}

const stableVersion = Effect.fn('stableVersion')(function* (
  root: string,
  bump: Bump,
) {
  const previousTag = yield* latestTag(root);
  const version = bumpVersion(previousTag.slice(1), bump);
  return { previousTag, version, tag: `v${version}` };
});

/**
 * The half of a stable release that needs no credentials: bumps every
 * package from the latest tag, checks the bump (`checkRelease`), builds, and
 * packs the published packages into `dir`. The bump stays in the working
 * tree; `publishStable` makes it again in its own checkout and commits it.
 */
export const packStable = Effect.fn('packStable')(function* (
  root: string,
  opts: PackOptions & { readonly bump: Bump },
) {
  yield* ensureClean(root);
  const { previousTag, version, tag } = yield* stableVersion(root, opts.bump);
  yield* Console.log(`Packing ${tag} (${opts.bump} after ${previousTag})`);
  const { files, published } = yield* writeVersions(root, version);
  yield* Effect.gen(function* () {
    yield* checkRelease(root, files);
    yield* packTarballs(root, published, opts.dir);
  }).pipe(undoBumpOnFailure(root, files));
  return { tag, files };
});

/** How many times `pushReleaseCommit` pushes before giving up. */
const pushAttempts = 3;

/**
 * Pushes HEAD, the release commit, to `branch` and returns its sha. If
 * `branch` moved, which the merge queue does whenever a pull request lands
 * during a release, it merges `branch` into the release commit and pushes
 * that. The tarballs come from the release commit, so the tag goes on it,
 * not on the merge. The release commit is the merge's first parent, so
 * `latestTag` still finds the tag, and the merge's message starts with the
 * release commit's, so CI runs on it.
 */
export const pushReleaseCommit = Effect.fn('pushReleaseCommit')(function* (
  root: string,
  opts: {
    readonly remote: string;
    readonly branch: string;
    readonly tag: string;
  },
) {
  const released = yield* git(root, 'rev-parse', 'HEAD');
  for (let attempt = 1; ; attempt++) {
    const pushed = yield* git(
      root,
      'push',
      '--quiet',
      opts.remote,
      `HEAD:refs/heads/${opts.branch}`,
    ).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (pushed) {
      return released;
    }
    // branchMoved fetches `branch` into FETCH_HEAD, which the merge takes.
    if (!(yield* branchMoved(root, opts.remote, opts.branch))) {
      return yield* new ReleaseError({
        message: `Pushing the release commit to ${opts.remote} ${opts.branch} failed. Nothing was published.`,
      });
    }
    if (attempt === pushAttempts) {
      return yield* new ReleaseError({
        message: `${opts.branch} kept moving while this run pushed the release commit; release again from the new ${opts.branch}. Nothing was published.`,
      });
    }
    yield* Console.log(
      `${opts.branch} moved since this run checked it out; merging it into the release commit`,
    );
    yield* git(
      root,
      'merge',
      '--quiet',
      '--no-ff',
      '--message',
      `${releaseCommitMessage(opts.tag)} (merge ${opts.branch})`,
      'FETCH_HEAD',
    ).pipe(
      Effect.catchTag('CommandError', () =>
        git(root, 'merge', '--abort').pipe(
          Effect.ignore,
          Effect.andThen(
            new ReleaseError({
              message: `${opts.branch} moved since this run checked it out and doesn't merge into the release commit; release again from the new ${opts.branch}. Nothing was published.`,
            }),
          ),
        ),
      ),
    );
  }
});

/**
 * The half of a stable release that publishes: bumps every package from the
 * latest tag again and checks `dir` holds exactly their tarballs, which
 * `packStable` made on the same commit. Then pushes the release commit,
 * publishes the tarballs, tags and pushes the tag, and creates the GitHub
 * release. It runs nothing from the packages.
 *
 * HEAD must be on `branch`. The commit goes out before the packages and the
 * tag after them. If `branch` moved, `pushReleaseCommit` merges it in, or
 * fails and nothing is published. If publishing fails, running the release again finds the
 * versions already on `branch`, publishes what npm doesn't have yet and tags
 * it; it fails instead if npm has a version with other files than it packed.
 */
export const publishStable = Effect.fn('publishStable')(function* (
  root: string,
  opts: StableOptions & PackOptions,
) {
  yield* ensureClean(root);
  const { previousTag, version, tag } = yield* stableVersion(root, opts.bump);
  yield* Console.log(`Releasing ${tag} (${opts.bump} after ${previousTag})`);
  if (!opts.dryRun && !(yield* onBranch(root, opts.remote, opts.branch))) {
    return yield* new ReleaseError({
      message: `HEAD isn't on ${opts.remote} ${opts.branch}; release from ${opts.branch}. Nothing was published.`,
    });
  }

  const { files, published } = yield* writeVersions(root, version);
  const bumped =
    (yield* git(root, 'status', '--porcelain', '--', ...files)) !== '';
  const tarballs = yield* readTarballs(root, opts.dir, published);
  const registry = yield* publishRegistry(root);

  if (opts.dryRun) {
    yield* publishTarballs(root, tarballs, { ...opts, registry });
    const notes = yield* releaseNotes(root, { previousTag, tag });
    yield* Console.log(
      `Dry run: would push "${releaseCommitMessage(tag)}" to ${opts.remote} ${opts.branch}, publish, then tag ${tag}, push the tag and create the GitHub release with these notes. The version bump is left in the working tree.\n\n${notes}`,
    );
    return tag;
  }

  // The commit the tarballs were packed from, which the tag goes on.
  let released = 'HEAD';
  if (bumped) {
    yield* git(root, 'add', '--', ...files);
    yield* git(
      root,
      'commit',
      '--quiet',
      '--message',
      releaseCommitMessage(tag),
    );
    released = yield* pushReleaseCommit(root, { ...opts, tag });
  } else {
    yield* Console.log(
      `HEAD already has the ${tag} versions: an earlier run pushed them and stopped. Publishing what npm doesn't have yet.`,
    );
  }

  yield* publishTarballs(root, tarballs, { ...opts, registry });
  yield* git(root, 'tag', '--annotate', tag, '--message', tag, released);
  yield* git(root, 'push', '--quiet', opts.remote, `refs/tags/${tag}`);

  yield* waitForVersions(published, registry, opts.wait).pipe(
    Effect.mapError(
      (error) =>
        new ReleaseError({
          message: `${error.message}. ${tag} is pushed. Once npm serves them, create the GitHub release: pnpm release github-release ${tag}`,
        }),
    ),
  );
  yield* githubRelease(root, { tag, previousTag }).pipe(
    Effect.mapError(
      (error) =>
        new ReleaseError({
          message: `${error.message}. ${tag} is published and pushed; create the GitHub release: pnpm release github-release ${tag}`,
        }),
    ),
  );
  return tag;
});

/**
 * Both halves of a stable release in one run, for trying one locally with
 * `--dry-run`: packs into a temporary directory, undoes the bump and
 * publishes from there.
 */
export const stable = Effect.fn('stable')(function* (
  root: string,
  opts: StableOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const { files } = yield* packStable(root, { bump: opts.bump, dir });
  yield* git(root, 'checkout', '--quiet', '--', ...files);
  return yield* publishStable(root, { ...opts, dir });
}, Effect.scoped);

export interface CanaryOptions extends PublishOptions {
  readonly preid: string;
}

/**
 * HEAD's canary, `11.22.2-canary.42.gd3cd94bdd`: the patch after the latest
 * tag, the number of commits since it, and HEAD's short sha.
 */
const canaryVersionOfHead = Effect.fn('canaryVersionOfHead')(function* (
  root: string,
  preid: string,
) {
  const tag = yield* latestTag(root);
  const commits = Number(
    yield* git(root, 'rev-list', '--count', `${tag}..HEAD`),
  );
  const sha = yield* git(root, 'rev-parse', '--short=9', 'HEAD');
  return canaryVersion({ version: tag.slice(1), commits, sha, preid });
});

/** Versions every package as HEAD's canary, builds, and packs into `dir`. */
export const packCanary = Effect.fn('packCanary')(function* (
  root: string,
  opts: PackOptions & { readonly preid: string },
) {
  yield* ensureClean(root);
  const version = yield* canaryVersionOfHead(root, opts.preid);
  yield* Console.log(`Packing ${version}`);
  const { files, published } = yield* writeVersions(root, version);
  yield* Effect.gen(function* () {
    yield* run(root, 'pnpm', ['build']);
    yield* packTarballs(root, published, opts.dir);
  }).pipe(undoBumpOnFailure(root, files));
  return { version, files };
});

/**
 * Publishes the tarballs `packCanary` made on the same commit, after checking
 * `dir` holds exactly them. Nothing is committed or pushed.
 */
export const publishCanary = Effect.fn('publishCanary')(function* (
  root: string,
  opts: CanaryOptions & PackOptions,
) {
  const version = yield* canaryVersionOfHead(root, opts.preid);
  yield* Console.log(`Publishing ${version} as ${opts.distTag}`);
  const tarballs = yield* readTarballs(
    root,
    opts.dir,
    publishedVersions(yield* readPackages(root), version),
  );
  yield* publishTarballs(root, tarballs, {
    ...opts,
    registry: yield* publishRegistry(root),
  });
  return version;
});

/** Both halves of a canary in one run, like `stable`. */
export const canary = Effect.fn('canary')(function* (
  root: string,
  opts: CanaryOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const { files } = yield* packCanary(root, { preid: opts.preid, dir });
  yield* git(root, 'checkout', '--quiet', '--', ...files);
  return yield* publishCanary(root, { ...opts, dir });
}, Effect.scoped);

/**
 * `pnpm release notes [tag] [--to <ref>]`: prints the GitHub release notes
 * of `tag` without releasing anything. An existing tag gets its own notes;
 * otherwise `tag`, by default the patch after the latest tag, is a release
 * of `to`, by default HEAD.
 */
export const printNotes = Effect.fn('printNotes')(function* (
  root: string,
  opts: { readonly tag?: string; readonly to?: string },
) {
  const tagged =
    opts.tag !== undefined &&
    (yield* git(
      root,
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/tags/${opts.tag}`,
    ).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    ));
  const to = tagged ? opts.tag : (opts.to ?? 'HEAD');
  const previousTag = yield* latestTag(root, tagged ? `${opts.tag}^` : to);
  const tag = opts.tag ?? `v${bumpVersion(previousTag.slice(1), 'patch')}`;
  const notes = yield* releaseNotes(root, { previousTag, tag, to });
  yield* Console.log(notes);
  return notes;
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
