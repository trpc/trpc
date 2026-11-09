#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';
import { upgradeCommand } from './cli.ts';

// `src/bin.ts` in the workspace and `dist/bin.js` when installed sit one level below the manifest.
const version = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = path.join(import.meta.dirname, '..', 'package.json');
  return (JSON.parse(yield* fs.readFileString(manifest)) as { version: string })
    .version;
});

version.pipe(
  Effect.flatMap((v) => Command.run(upgradeCommand, { version: v })),
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
