/**
 * Runs as the root `postversion` script: lerna has committed and tagged the
 * release, and hasn't pushed or published anything yet. Any failure here
 * stops the release with nothing pushed, and removes the commit and tag.
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

const versionFile = (file: string) =>
  file === 'lerna.json' || /^packages\/[^/]+\/package\.json$/.test(file);

const check = Effect.fn('check')(function* (root: string) {
  const changed = lines(
    yield* git(root, 'diff', '--name-only', 'HEAD^', 'HEAD'),
  );
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
  const dirty = yield* git(root, 'status', '--porcelain');
  if (dirty !== '') {
    return yield* new CheckError({
      message: `pnpm install changed files:\n${dirty}`,
    });
  }

  yield* run(root, 'pnpm', ['typecheck-packages']).pipe(
    Effect.mapError(
      () =>
        new CheckError({
          message: 'pnpm typecheck-packages failed on the release commit.',
        }),
    ),
  );
});

/**
 * Drops the release commit and its tag, so a later `lerna publish` can't
 * push them with `--follow-tags`. lerna only commits from a clean tree, so
 * the reset loses nothing but the version bump.
 */
const undoRelease = Effect.fn('undoRelease')(function* (root: string) {
  const tags = lines(yield* git(root, 'tag', '--points-at', 'HEAD'));
  for (const tag of tags) {
    yield* git(root, 'tag', '--delete', tag);
  }
  yield* git(root, 'reset', '--quiet', '--hard', 'HEAD^');
  yield* Console.error(
    `Nothing was pushed or published. Removed the release commit and its tag (${tags.join(', ')}).`,
  );
});

Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.join(import.meta.dirname, '..');
  yield* check(root).pipe(Effect.tapError(() => undoRelease(root)));
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
