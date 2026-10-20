import { Console, Data, Effect, FileSystem, Path } from 'effect';

import { capture, lines, output } from './command.ts';

export class LandError extends Data.TaggedError('LandError')<{
  readonly message: string;
}> {}

export interface Target {
  readonly remote: string;
  readonly branch: string;
  /** The pnpm workspace, relative to the repository's root. */
  readonly workspace: string;
  /** Pushes to try before giving up, rebasing again after each rejection. */
  readonly attempts: number;
}

export interface Steps<R, E = never> {
  /** `pnpm install` in the workspace. */
  readonly install: (workspaceDir: string) => Effect.Effect<void, E, R>;
  /** Checks `files`, relative to the workspace; output goes to the terminal. */
  readonly check: (
    workspaceDir: string,
    files: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown, R>;
}

const git = (root: string, ...args: ReadonlyArray<string>) =>
  output(root, 'git', args);

const fail = (message: string) => Effect.fail(new LandError({ message }));

/** The files that `pnpm install` reads, as pathspecs from the repository's root. */
const installInputs = (workspace: string) => [
  `${workspace}/pnpm-lock.yaml`,
  `${workspace}/pnpm-workspace.yaml`,
  `:(glob)${workspace}/**/package.json`,
];

const rebasing = Effect.fn('rebasing')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dirs = yield* Effect.forEach(['rebase-merge', 'rebase-apply'], (name) =>
    git(root, 'rev-parse', '--git-path', name),
  );
  const exists = yield* Effect.forEach(dirs, (dir) =>
    fs.exists(path.resolve(root, dir)),
  );
  return exists.includes(true);
});

/**
 * Rebases HEAD onto `upstream`. A conflict in the lockfile alone takes
 * upstream's and reinstalls, so the lockfile matches the rebased
 * `package.json`s; any other conflict stops the rebase where it is.
 */
const rebase = <R, E>(
  root: string,
  target: Target,
  upstream: string,
  steps: Steps<R, E>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const lockfile = `${target.workspace}/pnpm-lock.yaml`;
    let result = yield* capture(root, 'git', ['rebase', '--quiet', upstream]);
    while (result.exitCode !== 0) {
      const conflicts = lines(
        yield* git(root, 'diff', '--name-only', '--diff-filter=U'),
      );
      if (
        conflicts.length === 0 ||
        conflicts.some((file) => file !== lockfile)
      ) {
        return yield* fail(
          [
            'The rebase stopped on conflicts in:',
            ...conflicts.map((file) => `  ${file}`),
            'Resolve them, `git add` them and run `git rebase --continue`, then rerun `pnpm land`.',
          ].join('\n'),
        );
      }
      yield* Console.log(
        `${lockfile} conflicts: taking ${target.remote}/${target.branch}'s and running pnpm install.`,
      );
      // In a rebase, "ours" is the branch being rebased onto.
      yield* git(root, 'checkout', '--ours', '--', lockfile);
      yield* steps.install(path.join(root, target.workspace));
      yield* git(root, 'add', '--', lockfile);
      result = yield* capture(root, 'git', [
        '-c',
        'core.editor=true',
        'rebase',
        '--continue',
      ]);
    }
  });

/**
 * Lands HEAD's commits on `target.branch`: rebases them onto the remote's,
 * reinstalls when the rebase brought in changes to what `pnpm install` reads,
 * checks the files the commits change, and pushes, rebasing again when the
 * push is rejected because the branch moved.
 */
export const land = <R, E>(cwd: string, target: Target, steps: Steps<R, E>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = yield* git(cwd, 'rev-parse', '--show-toplevel');
    const workspaceDir = path.join(root, target.workspace);
    const upstreamRef = `${target.remote}/${target.branch}`;

    if (yield* rebasing(root)) {
      return yield* fail(
        'A rebase is in progress: finish it (`git rebase --continue`) or abort it (`git rebase --abort`), then rerun `pnpm land`.',
      );
    }
    const dirty = yield* git(
      root,
      'status',
      '--porcelain',
      '--untracked-files=no',
    );
    if (dirty !== '') {
      return yield* fail(
        `Commit or drop these changes first (not with \`git stash\`, which every worktree shares):\n${dirty}`,
      );
    }

    for (let attempt = 1; ; attempt++) {
      yield* git(root, 'fetch', '--quiet', target.remote, target.branch);
      const upstream = yield* git(root, 'rev-parse', 'FETCH_HEAD');
      const ahead = lines(yield* git(root, 'rev-list', `${upstream}..HEAD`));
      if (ahead.length === 0) {
        return yield* Console.log(
          `Nothing to land: HEAD is in ${upstreamRef}.`,
        );
      }

      const base = yield* git(root, 'merge-base', 'HEAD', upstream);
      if (base !== upstream) {
        yield* Console.log(
          `Rebasing ${ahead.length} commit(s) onto ${upstreamRef} (${upstream.slice(0, 10)}).`,
        );
        yield* rebase(root, target, upstream, steps);
        const inputs = yield* git(
          root,
          'diff',
          '--name-only',
          base,
          upstream,
          '--',
          ...installInputs(target.workspace),
        );
        if (inputs !== '') {
          yield* Console.log(
            `${upstreamRef} changed what pnpm install reads; running it.`,
          );
          yield* steps.install(workspaceDir);
          const changed = yield* git(
            root,
            'status',
            '--porcelain',
            '--untracked-files=no',
          );
          if (changed !== '') {
            return yield* fail(
              `pnpm install changed these files after the rebase: commit them, then rerun \`pnpm land\`.\n${changed}`,
            );
          }
        }
      }

      const files = lines(
        yield* git(
          root,
          'diff',
          '--name-only',
          '--diff-filter=d',
          `--relative=${target.workspace}`,
          upstream,
          'HEAD',
        ),
      );
      if (files.length > 0) {
        yield* Console.log(`Checking the ${files.length} changed file(s).`);
        yield* steps.check(workspaceDir, files).pipe(
          Effect.mapError(
            () =>
              new LandError({
                message:
                  'The checks failed on the rebased commits: fix them, commit, and rerun `pnpm land`.',
              }),
          ),
        );
      }

      const pushed = yield* capture(root, 'git', [
        'push',
        '--quiet',
        target.remote,
        `HEAD:refs/heads/${target.branch}`,
      ]);
      if (pushed.exitCode === 0) {
        const landed = yield* git(
          root,
          'log',
          '--oneline',
          `${upstream}..HEAD`,
        );
        return yield* Console.log(`Landed on ${upstreamRef}:\n${landed}`);
      }
      if (attempt >= target.attempts) {
        return yield* fail(
          `The push was rejected ${attempt} times; rerun \`pnpm land\`.`,
        );
      }
      yield* Console.log(
        `The push was rejected; rebasing again (attempt ${attempt + 1} of ${target.attempts}).`,
      );
    }
  });
