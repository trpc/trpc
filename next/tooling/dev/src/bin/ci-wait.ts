#!/usr/bin/env node
/**
 * `pnpm ci:wait [commit]`: waits for the first `next.yml` run on `v12` that
 * includes the commit (HEAD by default) and isn't cancelled, then reports it.
 * Exits 1 when that run failed.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Console, Duration, Effect, Schema } from 'effect';

import { capture, lines, output } from '../command.ts';
import { CiTimeout, Run, waitForRun } from '../ci.ts';

const branch = 'v12';
const workflow = 'next.yml';
/** The paths `next.yml` runs for (`on.push.paths`). */
const watched = ['next', 'vendor-src.json', '.github/workflows/next.yml'];

const Runs = Schema.fromJsonString(Schema.Array(Run));

const program = Effect.gen(function* () {
  const cwd = process.cwd();
  const root = yield* output(cwd, 'git', ['rev-parse', '--show-toplevel']);
  const git = (...args: ReadonlyArray<string>) => output(root, 'git', args);
  const isAncestor = (ancestor: string, of: string) =>
    capture(root, 'git', ['merge-base', '--is-ancestor', ancestor, of]).pipe(
      Effect.map((result) => result.exitCode === 0),
    );

  const commit = yield* git(
    'rev-parse',
    `${process.argv[2] ?? 'HEAD'}^{commit}`,
  );
  yield* git('fetch', '--quiet', 'origin', branch);
  if (!(yield* isAncestor(commit, 'FETCH_HEAD'))) {
    return yield* Console.error(
      `${commit.slice(0, 10)} isn't on origin/${branch}: land it first (\`pnpm land\`).`,
    ).pipe(Effect.andThen(Effect.fail('not landed')));
  }
  const touched = yield* git(
    'diff',
    '--name-only',
    `${commit}^`,
    commit,
    '--',
    ...watched,
  );
  if (touched === '') {
    yield* Console.log(
      `${workflow} doesn't run for ${commit.slice(0, 10)}'s paths; waiting for a later run that includes it.`,
    );
  }

  const result = yield* waitForRun(
    {
      runs: git('fetch', '--quiet', 'origin', branch).pipe(
        Effect.andThen(
          output(root, 'gh', [
            'run',
            'list',
            '--workflow',
            workflow,
            '--branch',
            branch,
            '--event',
            'push',
            '--limit',
            '30',
            '--json',
            'databaseId,headSha,status,conclusion,url',
          ]),
        ),
        Effect.flatMap(Schema.decodeEffect(Runs)),
      ),
      covers: (headSha) => isAncestor(commit, headSha),
    },
    { interval: Duration.seconds(30), timeout: Duration.minutes(45) },
  );

  const run = result.run;
  const later = result.later
    .slice(-3)
    .map((next) => `${next.conclusion} ${next.url}`);
  yield* Console.log(
    [
      `${workflow} ${run.conclusion} on ${run.headSha.slice(0, 10)}, which includes ${commit.slice(0, 10)}: ${run.url}`,
      ...(later.length > 0 ? ['The next finished runs:', ...later] : []),
    ].join('\n'),
  );
  if (run.conclusion !== 'success') {
    const failed = yield* output(root, 'gh', [
      'run',
      'view',
      String(run.databaseId),
      '--json',
      'jobs',
      '--jq',
      '.jobs[] | select(.conclusion == "failure") | .name',
    ]);
    yield* Console.error(
      [
        `Failed jobs: ${lines(failed).join(', ')}`,
        `Logs: gh run view ${run.databaseId} --log-failed`,
      ].join('\n'),
    );
    return yield* Effect.fail(run.conclusion);
  }
});

program.pipe(
  Effect.tapCause((cause) => {
    const error = Cause.squash(cause);
    return error instanceof CiTimeout
      ? Console.error(error.message)
      : typeof error === 'string'
        ? Effect.void
        : Console.error(Cause.pretty(cause));
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
