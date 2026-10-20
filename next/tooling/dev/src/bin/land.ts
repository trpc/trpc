#!/usr/bin/env node
/**
 * `pnpm land`: lands the current branch's commits on `origin/v12`. See
 * {@link land}; the check is `vp check` on the changed files, and
 * `pnpm lint:docs` on the changed docs pages.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Console, Effect } from 'effect';

import { run } from '../command.ts';
import { land, LandError } from '../land.ts';

const check = Effect.fn('check')(function* (
  dir: string,
  files: ReadonlyArray<string>,
) {
  yield* run(dir, 'pnpm', [
    'exec',
    'vp',
    'check',
    '--no-error-on-unmatched-pattern',
    ...files,
  ]);
  const pages = files.filter(
    (file) => file.startsWith('www/docs/') && file.endsWith('.md'),
  );
  if (pages.length > 0) {
    yield* run(dir, 'node', ['tooling/docs-lint/docs-lint.ts', ...pages]);
  }
});

land(
  process.cwd(),
  { remote: 'origin', branch: 'v12', workspace: 'next', attempts: 5 },
  { install: (dir) => run(dir, 'pnpm', ['install']), check },
).pipe(
  Effect.tapCause((cause) => {
    const error = Cause.squash(cause);
    return Console.error(
      error instanceof LandError ? error.message : Cause.pretty(cause),
    );
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
