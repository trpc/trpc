#!/usr/bin/env node
/**
 * Vercel's "Ignored Build Step" for the docs site, run by `../../ignore.sh`
 * from `www` once this package is installed: exit 0 skips the deployment,
 * exit 1 builds it. Any failure builds: Vercel fails the deployment on other
 * exit codes. trpc.io's project (`www`) builds both `main` and this tree;
 * v12.trpc.io is its domain for the `v12` branch.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Console, Effect, Exit } from 'effect';

import { decide } from '../decide.ts';

decide(
  {
    dir: process.cwd(),
    // The packages' tests: the site imports, compiles and links their
    // sources, never a test.
    ignored: [
      'next/packages/**/*.test.ts',
      'next/packages/**/*.test.tsx',
      'v11/packages/**/*.test.ts',
      'v11/packages/**/*.test.tsx',
      'v11/packages/*/test/**',
    ],
    // Every version's docs are in `www/`, so the project's own directory has
    // them; the decisions pages render the first two, the benchmarks page the
    // parity matrix's feature tables, and turbo runs the build.
    inputs: [
      'next/.agent-docs/open',
      'next/.agent-docs/decisions',
      'next/.agent-docs/reference/orpc-parity.md',
      'turbo.json',
    ],
  },
  {
    production: 'v12',
    project: 'prj_c5CXAea2uGBuHaIfJeWjXbW6c4Jn',
    remote: 'https://github.com/trpc/trpc.git',
  },
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
