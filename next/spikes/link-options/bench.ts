/**
 * Usage: `node link-options/bench.ts [n=1000] [runs=5]` from `spikes/`.
 *
 * Reuses the positional 1k-procedure router from `builder-generics` and
 * compares client files that call every procedure through:
 * - `plain`: `createClient<AppRouter>()` with no link-declared options;
 * - `d-a` / `d-c`: link-informed clients with 5 links, passing call options on every call.
 */
import { Console, Effect, FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';
import { generate } from '../builder-generics/generate.ts';
import { intArg, median, runScript, tscDiagnostics } from '../kit.ts';

const links = `[cacheLink(), retryLink(), loggerLink(), httpLink({ url: '/trpc' }), splitLink({ condition: (op) => op.path === 'r0.p0', true: loggerLink(), false: loggerLink() })]`;
const setup = {
  plain: `import { createClient } from '../../positional.ts';
const client = createClient<AppRouter>();
void 0;`,
  'd-a': `import { createClientA } from '../../../link-options/variants.ts';
import { cacheLink, httpLink, loggerLink, retryLink, splitLink } from '../../../link-options/core.ts';
const client = createClientA<AppRouter>()({ links: ${links} });
const opts = { ignoreCache: true, retries: 2, context: { headers: {} } };`,
  'd-c': `import { createClientC } from '../../../link-options/variants.ts';
import { cacheLink, httpLink, loggerLink, retryLink, splitLink, type } from '../../../link-options/core.ts';
const client = createClientC({ router: type<AppRouter>(), links: ${links} });
const opts = { ignoreCache: true, retries: 2, context: { headers: {} } };`,
};

function call(i: number, withOpts: boolean): string {
  const o = withOpts ? ', opts' : '';
  const path = `client.r${Math.floor(i / 10)}.p${i % 10}`;
  switch (i % 5) {
    case 0:
      return `void ${path}.query(undefined${o});`;
    case 1:
      return `void ${path}.query({ id: 'a', f${i}: 1 }${o});`;
    case 2:
      return `void ${path}.mutate({ title: 'a', m${i}: 'b' }${o});`;
    case 3:
      return `void ${path}.query({ a${i}: 1, b${i}: 'x' }${o});`;
    default:
      return `void ${path}.query(undefined${o});`;
  }
}

const bench = Command.make(
  'bench',
  { n: intArg('n', 1000), runs: intArg('runs', 5) },
  ({ n, runs }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* generate(
        'positional',
        n,
        path.join(import.meta.dirname, '../builder-generics/generated'),
      );
      yield* Console.log('| client | instantiations | check (median) |');
      yield* Console.log('| --- | ---: | ---: |');
      for (const [name, head] of Object.entries(setup)) {
        yield* fs.writeFileString(
          path.join(dir, `links-${name}.ts`),
          `import type { AppRouter } from './router.ts';
${head}
${Array.from({ length: n }, (_, i) => call(i, name !== 'plain')).join('\n')}
`,
        );
        const tsconfig = path.join(dir, `tsconfig.links-${name}.json`);
        yield* fs.writeFileString(
          tsconfig,
          JSON.stringify({
            extends: '../../../../tsconfig.json',
            compilerOptions: { allowImportingTsExtensions: true },
            files: [`links-${name}.ts`],
          }),
        );
        const samples = yield* Effect.replicateEffect(
          tscDiagnostics(tsconfig),
          runs,
        );
        yield* Console.log(
          `| ${name} | ${samples[0]!['Instantiations']} | ${median(samples.map((s) => s['Check time']!))}s |`,
        );
      }
    }),
);

runScript(import.meta, bench);
