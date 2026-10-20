/**
 * `pnpm decisions:check [file…]`: compiles the code blocks of the open
 * questions and decisions in `.agent-docs` (or of the files named) as the
 * site's build does, in `samples/decisions` with its stubs, and prints each
 * file's error. Faster than a build: one process, and the build's cache.
 */
import { resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';

import { messageOf } from './content-error.ts';
import { decisionPages } from './decisions-content.ts';
import { decisionsOptions } from './paths.ts';

const check = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pages = decisionPages(decisionsOptions);
  const named = process.argv.slice(2).map((file) => resolve(file));
  const files =
    named.length > 0
      ? named
      : [
          ...(yield* fs.readDirectory(pages.openDir)).map((file) =>
            path.join(pages.openDir, file),
          ),
          ...(yield* fs.readDirectory(pages.decisionsDir)).map((file) =>
            path.join(pages.decisionsDir, file),
          ),
        ].filter((file) => file.endsWith('.md'));
  let failed = 0;
  yield* Effect.forEach(files, (file) =>
    Effect.gen(function* () {
      const render = pages.renderFile(file, yield* fs.readFileString(file));
      if (!render) {
        return;
      }
      yield* render.pipe(
        Effect.catch((error) => {
          failed += 1;
          return Effect.logError(messageOf(error));
        }),
      );
    }),
  );
  const stats = pages.stats;
  yield* Effect.log(
    `${files.length - failed} of ${files.length} files compile${stats ? ` (${stats.hits} code blocks from the cache, ${stats.misses} compiled)` : ''}`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
});

Effect.runPromise(Effect.provide(check, NodeServices.layer));
