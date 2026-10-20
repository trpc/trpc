import {
  Config,
  Data,
  Effect,
  Option,
  Path,
  Stream,
  String as Str,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { dependencyDirs, workspaceRoot } from './workspace.ts';

/** Workspace root files whose changes can change any project's install. */
const installInputs = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'patches',
];

export interface Repo {
  /** The branch Vercel deploys to production. */
  readonly production: string;
  /** Where a branch's first deployment fetches {@link production} from. */
  readonly remote: string;
}

export interface Project {
  /** The project's directory: Vercel's root directory. */
  readonly dir: string;
  /**
   * Paths outside workspace packages that the project builds from, relative
   * to the workspace root.
   */
  readonly inputs: ReadonlyArray<string>;
  /**
   * Globs, relative to the workspace root, of files under the watched paths
   * that the project doesn't build from, such as other packages' tests.
   */
  readonly ignored?: ReadonlyArray<string> | undefined;
}

class GitError extends Data.TaggedError('GitError')<{
  readonly args: ReadonlyArray<string>;
  readonly exitCode: number;
}> {
  override get message() {
    return `git ${this.args.join(' ')} exited with ${this.exitCode}`;
  }
}

/**
 * Runs git in `cwd` and returns its trimmed stdout. Fails on a non-zero exit.
 * Pathspecs are relative to `cwd`.
 */
export const git = Effect.fn('git')(function* (
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
    return yield* new GitError({ args, exitCode });
  }
  return Str.trim(stdout);
}, Effect.scoped);

/**
 * The commit to diff from: the project's last deployment on this branch, or,
 * on a branch's first deployment, where the branch left the production
 * branch. `None` on the production branch's first deployment.
 */
const baseCommit = Effect.fn('baseCommit')(function* (
  root: string,
  repo: Repo,
) {
  const previous = yield* Config.String('VERCEL_GIT_PREVIOUS_SHA').pipe(
    Config.option,
  );
  if (Option.isSome(previous) && previous.value !== '') {
    // Vercel's clone is shallow, so the last deployment's commit is missing
    // when more commits than its depth landed since. `git diff` only needs
    // that commit's tree.
    const present = yield* git(
      root,
      'cat-file',
      '-e',
      `${previous.value}^{commit}`,
    ).pipe(
      Effect.as(true),
      Effect.catchTag('GitError', () => Effect.succeed(false)),
    );
    if (!present) {
      yield* git(
        root,
        'fetch',
        '--quiet',
        '--no-tags',
        '--depth=1',
        repo.remote,
        previous.value,
      );
    }
    return previous;
  }
  const branch = yield* Config.String('VERCEL_GIT_COMMIT_REF').pipe(
    Config.withDefault(''),
  );
  if (branch === repo.production) {
    return Option.none<string>();
  }
  yield* git(
    root,
    'fetch',
    '--quiet',
    '--no-tags',
    '--depth=100',
    repo.remote,
    repo.production,
  );
  return Option.some(yield* git(root, 'merge-base', 'FETCH_HEAD', 'HEAD'));
});

/**
 * Whether Vercel should build `project`: yes when the project, a workspace
 * package it depends on, one of its inputs, or an install input changed since
 * {@link baseCommit}.
 */
export const decide = Effect.fn('decide')(function* (
  project: Project,
  repo: Repo,
) {
  const path = yield* Path.Path;
  const root = yield* workspaceRoot(project.dir);
  const watched = [
    ...(yield* dependencyDirs(root, path.relative(root, project.dir))),
    ...project.inputs,
    ...installInputs,
  ];
  const base = yield* baseCommit(root, repo);
  if (Option.isNone(base)) {
    return { build: true, reason: 'No earlier deployment to compare with.' };
  }

  const ignored = project.ignored ?? [];
  const changed = yield* git(
    root,
    'diff',
    '--name-only',
    base.value,
    'HEAD',
    '--',
    ...watched,
    ...ignored.map((glob) => `:(exclude,glob)${glob}`),
  );
  const since = `since ${base.value.slice(0, 12)} in ${watched.join(', ')}${
    ignored.length > 0 ? ` (not ${ignored.join(', ')})` : ''
  }`;
  return changed === ''
    ? { build: false, reason: `Nothing changed ${since}.` }
    : { build: true, reason: `Changed ${since}:\n${changed}` };
});
