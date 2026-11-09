/**
 * `node error-registry/bundle.ts` from `spikes/`: what a client that
 * matches errors weighs, bundled the way `pnpm bench budget` bundles
 * (rolldown, minified, gzip -9). The registry client and the client of an
 * app with no registry are the same source but for the `AppRouter` they
 * import a type from, so their bundles should be the same bytes, with none
 * of the registry's strings in them. The control imports the registry at
 * runtime, as a client that rebuilt errors from it would; `today` is v12's
 * client and `matchError()` by code.
 *
 * The boundary entries are the same check for error boundaries typed with
 * `errorsOf<AppRouter>()`, and print the guard each ships: the internal
 * boundary's `claims` test and the claims it compares against.
 */
import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';
import { join } from 'node:path';
import { kb, measure, type Size } from '../client-bundle/bundle.ts';
import { runScript } from '../kit.ts';

const here = join(import.meta.dirname, 'bundle');

const entries = [
  ['today: v12 client, `matchError()` by code', 'today-client.ts'],
  ['no registry: the shared client', 'plain-client.ts'],
  ['registry (E): the shared client', 'registry-client.ts'],
  ['control: registry imported at runtime', 'runtime-registry-client.ts'],
  ['boundaries (A): by code', 'boundary-a.ts'],
  ['boundaries (B): from the registry', 'boundary-b.ts'],
  ['boundaries (C): from the class list', 'boundary-c.ts'],
  ['boundaries (D): from the builder', 'boundary-d.ts'],
  ['boundaries (E): from the posts subtree', 'boundary-e.ts'],
  ['boundaries (F): from the `Errors` interface', 'boundary-f.ts'],
  ['boundaries (G): from the posts subtree', 'boundary-g.ts'],
  ['boundaries, no registry: from the posts subtree', 'boundary-plain.ts'],
] as const;

/** The minified code around `needle`, to show what a client ships. */
const around = (code: string, needle: string, before = 60, after = 120) => {
  const at = code.indexOf(needle);
  return at === -1
    ? `(no ${needle})`
    : code.slice(Math.max(0, at - before), at + needle.length + after);
};

/** Strings only the server's registry has: descriptions, messages, zod. */
const serverOnly = [
  'Sign in first.',
  'No post with this id.',
  'That title is taken',
  'CardDeclined',
  'retryAfter',
  'ZodError',
];

const bundle = Command.make('bundle', {}, () =>
  Effect.gen(function* () {
    const sizes = new Map<string, Size>();
    const rows: Array<string> = [];
    for (const [name, file] of entries) {
      const size = yield* Effect.promise(() =>
        measure({ file: join(here, file) }),
      );
      sizes.set(file, size);
      const found = serverOnly.filter((s) => size.code.includes(s));
      rows.push(
        `| ${name} | ${kb(size.min)} | ${kb(size.gzip)} | ${found.length === 0 ? 'none' : found.join(', ')} |`,
      );
    }
    const same = (a: string, b: string) =>
      sizes.get(a)!.code === sizes.get(b)!.code ? 'yes' : 'no';
    const tagged = ['b', 'c', 'd', 'e', 'f', 'g'].map(
      (o) => `boundary-${o}.ts`,
    );
    const allSame = tagged.every(
      (file) => sizes.get(file)!.code === sizes.get('boundary-plain.ts')!.code,
    );
    yield* Console.log(
      `| client | min | gzip | registry strings |\n| --- | ---: | ---: | --- |\n${rows.join('\n')}\n\nregistry and no-registry bundles identical: ${same('registry-client.ts', 'plain-client.ts')}\nB to G's boundaries and the no-registry app's identical: ${allSame ? 'yes' : 'no'}`,
    );
    for (const file of ['boundary-e.ts', 'boundary-a.ts']) {
      const code = sizes.get(file)!.code;
      yield* Console.log(
        `\n${file}\n  guard: ${around(code, '.includes(', 80, 80)}\n  source and claims: ${around(code, '=()=>({})', 10, 400)}`,
      );
    }
  }),
);

runScript(import.meta, bundle);
