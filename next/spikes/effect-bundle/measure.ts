// Usage (from next/spikes): node effect-bundle/measure.ts [--modules name] [--write]
//
// Bundles every fixture with rolldown (ESM, browser, tree-shaken, minified,
// NODE_ENV=production) and reports minified, gzip -9 and brotli sizes.
// Mirrors Effect's packages/tools/bundle (Rollup + terser + gzip -9).
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { Console, Data, Effect, FileSystem, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';
import { rolldown, type OutputChunk } from 'rolldown';
import { runScript } from '../kit.ts';

export class BundleFailed extends Data.TaggedError('BundleFailed')<{
  readonly fixture: string;
  readonly cause: unknown;
}> {}

/** One fixture bundled the way Effect measures its own bundles. */
export const bundle = (input: string, opts: { readonly minify: boolean }) =>
  Effect.tryPromise({
    try: async () => {
      const build = await rolldown({
        input,
        platform: 'browser',
        treeshake: true,
        logLevel: 'silent',
        transform: { define: { 'process.env.NODE_ENV': '"production"' } },
      });
      try {
        const { output } = await build.generate({
          format: 'esm',
          minify: opts.minify,
        });
        const chunks = output.filter(
          (o): o is OutputChunk => o.type === 'chunk',
        );
        if (chunks.length !== 1) throw new Error('expected one chunk');
        return chunks[0]!;
      } finally {
        await build.close();
      }
    },
    catch: (cause) => new BundleFailed({ fixture: input, cause }),
  });

interface Result {
  name: string;
  minified: number;
  gzip: number;
  brotli: number;
  chunk: OutputChunk;
}

const kb = (n: number) => (n / 1024).toFixed(2);

const measure = Command.make(
  'measure',
  {
    modules: Flag.String('modules').pipe(Flag.optional),
    write: Flag.Boolean('write').pipe(Flag.withDefault(false)),
  },
  ({ modules, write }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const here = import.meta.dirname;
      const fixturesDir = path.join(here, 'fixtures');
      const distDir = path.join(here, '..', 'dist', 'effect-bundle');

      const moduleGroup = (id: string): string => {
        const pkg =
          /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(
            id,
          );
        if (pkg) {
          const [, name, rest] = pkg;
          return name === 'effect'
            ? `effect/${rest!.replace(/^dist\//, '')}`
            : `${name}/${rest}`;
        }
        return path.relative(path.join(here, '..'), id);
      };

      const files = (yield* fs.readDirectory(fixturesDir))
        .filter((f) => f.endsWith('.ts'))
        .sort();
      const results: Result[] = [];
      for (const file of files) {
        const chunk = yield* bundle(path.join(fixturesDir, file), {
          minify: true,
        });
        const code = Buffer.from(chunk.code);
        if (write) {
          yield* fs.makeDirectory(distDir, { recursive: true });
          yield* fs.writeFile(
            path.join(distDir, file.replace(/\.ts$/, '.js')),
            code,
          );
        }
        results.push({
          name: file.replace(/\.ts$/, ''),
          minified: code.length,
          gzip: gzipSync(code, { level: 9 }).length,
          brotli: brotliCompressSync(code, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).length,
          chunk,
        });
      }

      yield* Console.log(
        '| fixture | min (KB) | min+gzip (KB) | min+brotli (KB) |',
      );
      yield* Console.log('| --- | ---: | ---: | ---: |');
      for (const r of results) {
        yield* Console.log(
          `| \`${r.name}\` | ${kb(r.minified)} | ${kb(r.gzip)} | ${kb(r.brotli)} |`,
        );
      }

      if (Option.isNone(modules)) return;
      const name = modules.value;
      const r = results.find((x) => x.name === name);
      if (!r) return yield* Effect.die(new Error(`no fixture named ${name}`));
      const rows = Object.entries(r.chunk.modules)
        .map(([id, m]) => [moduleGroup(id), m.renderedLength] as const)
        .filter(([, len]) => len > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((sum, [, len]) => sum + len, 0);
      yield* Console.log(`\n${name}: rendered (pre-minify) bytes by module\n`);
      yield* Console.log('| module | bytes | share |');
      yield* Console.log('| --- | ---: | ---: |');
      for (const [id, len] of rows.slice(0, 25)) {
        yield* Console.log(
          `| ${id} | ${len} | ${((len / total) * 100).toFixed(1)}% |`,
        );
      }
      yield* Console.log(`| (${rows.length} modules) | ${total} | |`);
    }),
);

runScript(import.meta, measure);
