/**
 * Runs as the root `postversion` script: lerna has committed and tagged the
 * release, and hasn't pushed or published anything yet. Any failure here
 * stops the release with nothing pushed, and removes the commit and tag.
 *
 * As the root `preversion` script (`check-release-commit.ts preversion`), it
 * only requires a clean tree, before lerna writes any version: lerna commits
 * the index, and with `--force-publish` it doesn't check the tree itself.
 *
 * The release commit may only change versions: `lerna.json` and the
 * packages' `package.json`. Their dependencies on each other are
 * `workspace:*`, so `pnpm-lock.yaml` stays the same, and pnpm must accept it
 * as it is. A release that re-resolves dependencies broke typecheck on main
 * with v11.23.0, so typecheck runs before the push too.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, Path, Stream, String as Str } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

class CheckError extends Data.TaggedError('CheckError')<{
  readonly message: string;
}> {}

/** Runs `command` with the terminal attached. Fails on a non-zero exit. */
const run = Effect.fn('run')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  yield* Console.log(`$ ${command} ${args.join(' ')}`);
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(command, args, {
      cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new CheckError({
      message: `${command} ${args.join(' ')} exited with ${exitCode}`,
    });
  }
});

/** Runs git and returns its trimmed stdout. Fails on a non-zero exit. */
const git = Effect.fn('git')(function* (
  cwd: string,
  ...args: ReadonlyArray<string>
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make('git', args, { cwd, stderr: 'inherit' }),
  );
  const [stdout, exitCode] = yield* Effect.all(
    [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
    { concurrency: 'unbounded' },
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new CheckError({
      message: `git ${args.join(' ')} exited with ${exitCode}`,
    });
  }
  return Str.trim(stdout);
}, Effect.scoped);

const lines = (text: string) => text.split('\n').filter((line) => line !== '');

// git names files from the repo root, and v11 lives in `v11/`.
const versionFile = (file: string) =>
  file === 'v11/lerna.json' ||
  /^v11\/packages\/[^/]+\/package\.json$/.test(file);

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

/**
 * A version file without what a release may change: `version`, and the
 * `@trpc/*` ranges that `scripts/version.ts` pins (`workspace:` ones stay).
 */
const withoutVersions = (text: string) => {
  const { version: _version, ...json } = JSON.parse(text) as Record<
    string,
    unknown
  >;
  for (const field of dependencyFields) {
    const deps = json[field] as Record<string, string> | undefined;
    if (deps === undefined) {
      continue;
    }
    json[field] = Object.fromEntries(
      Object.entries(deps).map(([name, range]) => [
        name,
        name.startsWith('@trpc/') && !range.startsWith('workspace:')
          ? '<version>'
          : range,
      ]),
    );
  }
  return JSON.stringify(json);
};

const check = Effect.fn('check')(function* (
  root: string,
  changed: ReadonlyArray<string>,
  startDirty: string,
) {
  if (startDirty !== '') {
    return yield* new CheckError({
      message: `The working tree has changes outside the release commit, so the checks wouldn't test what gets pushed. Commit or stash them, then release again:\n${startDirty}`,
    });
  }
  if (changed.includes('pnpm-lock.yaml')) {
    return yield* new CheckError({
      message:
        'The release commit changes pnpm-lock.yaml. A release only bumps versions, and the packages depend on each other with workspace:*, so the lockfile must stay the same.',
    });
  }
  const others = changed.filter((file) => !versionFile(file));
  if (others.length > 0) {
    return yield* new CheckError({
      message: `The release commit changes files other than versions: ${others.join(', ')}`,
    });
  }
  // lerna writes the bump over whatever the manifests hold and commits the
  // index, so an edit made before the release would ride along.
  const edited: Array<string> = [];
  for (const file of changed) {
    const [before, after] = [
      yield* git(root, 'show', `HEAD^:${file}`),
      yield* git(root, 'show', `HEAD:${file}`),
    ];
    if (withoutVersions(before) !== withoutVersions(after)) {
      edited.push(file);
    }
  }
  if (edited.length > 0) {
    return yield* new CheckError({
      message: `The release commit changes more than versions in: ${edited.join(', ')}`,
    });
  }

  yield* run(root, 'pnpm', [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
  ]).pipe(
    Effect.mapError(
      () =>
        new CheckError({
          message:
            "pnpm doesn't accept pnpm-lock.yaml for the bumped package.json files. Fix the lockfile on main, then release again.",
        }),
    ),
  );
  yield* ensureUnchanged(root, 'pnpm install');

  yield* run(root, 'pnpm', ['typecheck-packages']).pipe(
    Effect.mapError(
      () =>
        new CheckError({
          message: 'pnpm typecheck-packages failed on the release commit.',
        }),
    ),
  );
  // lerna builds and packs the working tree, which must still be the commit.
  yield* ensureUnchanged(root, 'pnpm typecheck-packages');
});

const ensureUnchanged = Effect.fn('ensureUnchanged')(function* (
  root: string,
  step: string,
) {
  const dirty = yield* git(root, 'status', '--porcelain');
  if (dirty !== '') {
    return yield* new CheckError({
      message: `The working tree changed during ${step}:\n${dirty}`,
    });
  }
});

/**
 * Drops the release commit and its tag, so a later `lerna publish` can't
 * push them with `--follow-tags`. With `--force-publish` lerna doesn't
 * require a clean tree, so other changes the tree started with are kept:
 * only the release commit's files go back to how they were.
 */
const undoRelease = Effect.fn('undoRelease')(function* (
  root: string,
  changed: ReadonlyArray<string>,
  startDirty: string,
) {
  const path = yield* Path.Path;
  const tags = lines(yield* git(root, 'tag', '--points-at', 'HEAD'));
  for (const tag of tags) {
    yield* git(root, 'tag', '--delete', tag);
  }
  if (startDirty === '') {
    // `--keep` keeps edits made during the checks, and refuses if they touch
    // the release commit's files; `--mixed` keeps those as they are.
    yield* git(root, 'reset', '--quiet', '--keep', 'HEAD^').pipe(
      Effect.catch(() => git(root, 'reset', '--quiet', '--mixed', 'HEAD^')),
    );
  } else {
    yield* git(root, 'reset', '--quiet', '--mixed', 'HEAD^');
    yield* git(path.join(root, '..'), 'checkout', 'HEAD', '--', ...changed);
  }
  yield* Console.error(
    `Nothing was pushed or published. Removed the release commit and its tag (${tags.join(', ')}).`,
  );
});

const ensureClean = Effect.fn('ensureClean')(function* (root: string) {
  const status = yield* git(root, 'status', '--porcelain');
  if (status !== '') {
    return yield* new CheckError({
      message: `The working tree has changes, and lerna would commit some of them with the release. Commit or stash them, then release again:\n${status}`,
    });
  }
});

Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.join(import.meta.dirname, '..');
  if (process.argv[2] === 'preversion') {
    return yield* ensureClean(root);
  }
  const changed = lines(
    yield* git(root, 'diff', '--name-only', 'HEAD^', 'HEAD'),
  );
  const startDirty = yield* git(root, 'status', '--porcelain');
  yield* check(root, changed, startDirty).pipe(
    Effect.tapError(() => undoRelease(root, changed, startDirty)),
  );
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
