#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';
import { upgradeCommand } from './cli.ts';

Command.run(upgradeCommand, { version: '0.1.0' }).pipe(
  Effect.catchReason('PlatformError', 'NotFound', (reason) =>
    Console.error(
      `trpc12-upgrade: no such file or directory: ${String(reason.pathOrDescriptor)}`,
    ).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
