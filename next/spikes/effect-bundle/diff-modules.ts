// Usage (from next/spikes): node effect-bundle/diff-modules.ts <fixtureA> <fixtureB>
// Lists modules (rendered bytes, pre-minify) that only one of two fixtures contains.
import { Console, Effect, Path } from 'effect';
import { Argument, Command } from 'effect/cli';
import { runScript } from '../kit.ts';
import { bundle } from './measure.ts';

const modules = (name: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const chunk = yield* bundle(
      path.join(import.meta.dirname, 'fixtures', `${name}.ts`),
      { minify: false },
    );
    return new Map(
      Object.entries(chunk.modules).map(([id, m]) => [
        id.replace(/^.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?/, ''),
        m.renderedLength,
      ]),
    );
  });

const diff = Command.make(
  'diff-modules',
  { a: Argument.String('fixtureA'), b: Argument.String('fixtureB') },
  ({ a, b }) =>
    Effect.gen(function* () {
      const [ma, mb] = yield* Effect.all([modules(a), modules(b)], {
        concurrency: 2,
      });
      for (const [label, x, y] of [
        [a, ma, mb],
        [b, mb, ma],
      ] as const) {
        yield* Console.log(`\nonly or bigger in ${label}:`);
        for (const [id, len] of [...x].sort((p, q) => q[1] - p[1])) {
          const other = y.get(id) ?? 0;
          if (len > other) yield* Console.log(`  ${id}: ${len} (vs ${other})`);
        }
      }
    }),
);

runScript(import.meta, diff);
