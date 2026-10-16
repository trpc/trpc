/**
 * Usage: `node builder-generics/bench.ts [n=1000] [runs=5]` from `spikes/`.
 *
 * For each variant: generate the fixture, run `tsc --extendedDiagnostics
 * --singleThreaded` `runs` times (median reported), and measure the emitted
 * `.d.ts` size of the router file.
 */
import { Console, Effect, FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';
import { intArg, medianDiagnostics, runScript } from '../kit.ts';
import { generate, variants } from './generate.ts';

/** Bytes of the routers' emitted declarations (not the client's). */
const dtsBytes = (dist: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let sum = 0;
    for (const file of yield* fs.readDirectory(dist)) {
      if (!file.endsWith('.d.ts') || file === 'client.d.ts') continue;
      sum += Number((yield* fs.stat(path.join(dist, file))).size);
    }
    return sum;
  });

const bench = Command.make(
  'bench',
  { n: intArg('n', 1000), runs: intArg('runs', 5) },
  ({ n, runs }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const rows: string[] = [];
      for (const variant of variants) {
        const dir = yield* generate(
          variant,
          n,
          path.join(import.meta.dirname, 'generated'),
        );
        const m = yield* medianDiagnostics(
          path.join(dir, 'tsconfig.json'),
          runs,
        );
        const dist = path.join(dir, 'dist', 'generated', `${variant}-${n}`);
        const routerDts = yield* fs.readFileString(
          path.join(dist, 'router0.d.ts'),
        );
        rows.push(
          `| ${variant} | ${n} | ${m('Types')} | ${m('Instantiations')} | ${Math.round(m('Memory used') / 1024)} MB | ${m('Check time')}s | ${m('Total time')}s | ${Math.round((yield* dtsBytes(dist)) / 1024)} KB | ${routerDts.length} B |`,
        );
        yield* Console.error(`done: ${variant}`);
      }
      yield* Console.log(
        '| variant | procedures | types | instantiations | memory | check (median) | total (median) | .d.ts (routers) | router0.d.ts |',
      );
      yield* Console.log(
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      );
      yield* Console.log(rows.join('\n'));
    }),
);

runScript(import.meta, bench);
