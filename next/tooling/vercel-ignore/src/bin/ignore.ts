#!/usr/bin/env node
/**
 * Vercel's "Ignored Build Step" for the docs site, run by `../../ignore.sh`
 * from `next/www` once this package is installed: exit 0 skips the deployment,
 * exit 1 builds it. Any failure builds: Vercel fails the deployment on other
 * exit codes.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Console, Effect, Exit } from 'effect';

import { decide } from '../decide.ts';

decide(
  {
    dir: process.cwd(),
    // The packages' tests: the site imports, compiles and links their
    // sources, never a test.
    ignored: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    // The docs are in `www/docs`, so the project's own directory has them.
    inputs: [],
  },
  { production: 'v12', remote: 'https://github.com/trpc/trpc.git' },
).pipe(
  Effect.catchCause((cause) =>
    Effect.succeed({
      build: true,
      reason: `The ignore step failed:\n${Cause.pretty(cause)}`,
    }),
  ),
  Effect.flatMap((decision) =>
    Console.log(
      `${decision.reason}\n${decision.build ? 'Building.' : 'Skipping.'}`,
    ).pipe(
      Effect.andThen(decision.build ? Effect.fail(decision) : Effect.void),
    ),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({
    disableErrorReporting: true,
    teardown: (exit, onExit) => onExit(Exit.isSuccess(exit) ? 0 : 1),
  }),
);
