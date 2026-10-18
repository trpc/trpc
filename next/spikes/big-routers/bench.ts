/**
 * Usage, from `spikes/`:
 * `node big-routers/bench.ts [domains=20] [perDomain=50] [used=2] [runs=3]`.
 *
 * Generates the monorepo (`generate.ts`), builds the server packages' `.d.ts`
 * with `tsc -b`, then prints, per project, the medians of `runs`
 * `tsc --extendedDiagnostics --singleThreaded` runs as a Markdown table.
 */
import { join } from 'node:path';
import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';
import { intArg, medianDiagnostics, runScript, tscBuild } from '../kit.ts';
import { apps, generate } from './generate.ts';

const bench = Command.make(
  'bench',
  {
    domains: intArg('domains', 20),
    perDomain: intArg('perDomain', 50),
    used: intArg('used', 2),
    runs: intArg('runs', 3),
  },
  (opts) =>
    Effect.gen(function* () {
      const dir = yield* generate(
        { domains: opts.domains, perDomain: opts.perDomain, used: opts.used },
        join(import.meta.dirname, 'generated'),
      );
      const build = yield* tscBuild(join(dir, 'packages/api/tsconfig.json'));
      yield* Console.log(
        `${opts.domains * opts.perDomain} procedures in ${opts.domains} domains; apps call the ${opts.used * opts.perDomain} of ${opts.used}. \`tsc -b\` of the server packages: ${build.toFixed(2)}s.\n`,
      );
      yield* Console.log(
        '| project | files | lines | types | instantiations | memory | check | total |',
      );
      yield* Console.log(
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      );
      const projects = [
        'whole-server',
        'packages/server',
        ...apps.map((app) => `apps/${app}`),
      ];
      for (const project of projects) {
        const m = yield* medianDiagnostics(
          join(dir, project, 'tsconfig.json'),
          opts.runs,
        );
        yield* Console.log(
          `| ${project} | ${m('Files')} | ${m('Lines')} | ${m('Types')} | ${m('Instantiations')} | ${Math.round(m('Memory used') / 1024)} MB | ${m('Check time').toFixed(2)}s | ${m('Total time').toFixed(2)}s |`,
        );
      }
    }),
);

runScript(import.meta, bench);
