/**
 * `node error-registry/bundle.ts` from `spikes/`: what a client that
 * matches errors weighs, bundled the way `pnpm bench budget` bundles
 * (rolldown, minified, gzip -9). The registry client and the client of an
 * app with no registry are the same source but for the `AppRouter` they
 * import a type from, so their bundles should be the same bytes, with none
 * of the registry's strings in them. The control imports the registry at
 * runtime, as a client that rebuilt errors from it would; `today` is v12's
 * client and `matchError()` by code.
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
] as const;

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
    const same =
      sizes.get('registry-client.ts')!.code ===
      sizes.get('plain-client.ts')!.code;
    yield* Console.log(
      `| client | min | gzip | registry strings |\n| --- | ---: | ---: | --- |\n${rows.join('\n')}\n\nregistry and no-registry bundles identical: ${same ? 'yes' : 'no'}`,
    );
  }),
);

runScript(import.meta, bundle);
