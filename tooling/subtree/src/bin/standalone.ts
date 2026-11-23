#!/usr/bin/env node
/**
 * Writes a standalone copy of an example into <out>, the way
 * `.github/workflows/subtree.yml` publishes it. To try one:
 * `pnpm --filter @tooling/subtree standalone examples/minimal-react /tmp/minimal-react`,
 * then install and build it in `/tmp/minimal-react`, outside the monorepo.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, Path } from 'effect';
import { writeStandalone } from '../standalone.ts';

Effect.gen(function* () {
  const path = yield* Path.Path;
  const [example, out] = process.argv.slice(2);
  if (example === undefined || out === undefined) {
    return yield* Effect.die(
      'Usage: pnpm --filter @tooling/subtree standalone <example> <out>',
    );
  }
  const cwd = process.env['INIT_CWD'] ?? process.cwd();
  yield* writeStandalone({
    example: path.resolve(cwd, example),
    out: path.resolve(cwd, out),
    root: path.join(import.meta.dirname, '../../../..'),
  });
  yield* Console.log(`Wrote ${example} to ${out}`);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
