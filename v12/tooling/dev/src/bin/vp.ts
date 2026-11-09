#!/usr/bin/env node
/**
 * Runs `vp` with {@link vpArgs}: `pnpm test -- --watch false <file>` runs
 * `<file>`, as `pnpm test <file>` does.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect, Exit } from 'effect';

import { exitCode } from '../command.ts';
import { vpArgs } from '../vp.ts';

exitCode(process.cwd(), 'vp', vpArgs(process.argv.slice(2))).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({
    teardown: (exit, onExit) =>
      onExit(
        Exit.isSuccess(exit) && typeof exit.value === 'number' ? exit.value : 1,
      ),
  }),
);
