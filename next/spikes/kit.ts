/**
 * What the spike scripts share: writing a generated fixture, running `tsc`
 * for its diagnostics, medians, and running a script's command.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Path,
  Stream,
  type PlatformError,
} from 'effect';
import { Argument, Command } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** A fixture's files, by path relative to its directory. */
export type Files = ReadonlyArray<readonly [path: string, contents: string]>;

/** Replaces `dir` with `files`. */
export const writeFixture = (
  dir: string,
  files: Files,
): Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.remove(dir, { recursive: true, force: true });
    for (const [file, contents] of files) {
      const target = path.join(dir, file);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, contents);
    }
    return dir;
  });

export class TscFailed extends Data.TaggedError('TscFailed')<{
  readonly tsconfig: string;
  readonly output: string;
}> {
  override get message() {
    return `tsc failed for ${this.tsconfig}\n${this.output.slice(0, 4000)}`;
  }
}

const tsc = new URL('./node_modules/.bin/tsc', import.meta.url).pathname;

/** `tsc --extendedDiagnostics --singleThreaded` on a project: its numbers by name (`Instantiations`, `Check time`, …). */
export const tscDiagnostics = (
  tsconfig: string,
): Effect.Effect<
  Record<string, number>,
  TscFailed | PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(tsc, [
          '-p',
          tsconfig,
          '--extendedDiagnostics',
          '--singleThreaded',
        ]),
      );
      const [output, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      if (exitCode !== 0) return yield* new TscFailed({ tsconfig, output });
      const numbers: Record<string, number> = {};
      for (const line of output.split('\n')) {
        const m = /^([A-Za-z ]+):\s+([\d.]+)/.exec(line.trim());
        if (m) numbers[m[1]!.trim()] = Number(m[2]);
      }
      return numbers;
    }),
  );

/** Medians of `runs` diagnostics of one project, by name. */
export const medianDiagnostics = (tsconfig: string, runs: number) =>
  Effect.map(
    Effect.replicateEffect(tscDiagnostics(tsconfig), runs),
    (samples) => (name: string) => median(samples.map((s) => s[name] ?? NaN)),
  );

export const median = (xs: ReadonlyArray<number>): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** An optional integer argument. */
export const intArg = (name: string, fallback: number) =>
  Argument.Int(name).pipe(Argument.withDefault(fallback));

/** Runs a script's command with Node's services, when the file is the entry point. */
export const runScript = <Name extends string, Input, Ctx, E>(
  meta: ImportMeta,
  command: Command.Command<Name, Input, Ctx, E, NodeServices.NodeServices>,
) => {
  if (!meta.main) return;
  Command.run(command, { version: '0.0.0' }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
};

/**
 * `node <spike>/bench.ts [n=1000] [runs=5]`: for each variant, generate the
 * fixture and print the medians of `runs` `tsc` runs as a Markdown row.
 */
export const variantBench = <V extends string, E, R>(
  name: string,
  variants: ReadonlyArray<V>,
  generate: (
    variant: V,
    n: number,
    outRoot: string,
  ) => Effect.Effect<string, E, R>,
  outRoot: string,
) =>
  Command.make(
    name,
    { n: intArg('n', 1000), runs: intArg('runs', 5) },
    ({ n, runs }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* Console.log(
          '| variant | procedures | types | instantiations | memory | check (median) |',
        );
        yield* Console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
        for (const variant of variants) {
          const dir = yield* generate(variant, n, outRoot);
          const m = yield* medianDiagnostics(
            path.join(dir, 'tsconfig.json'),
            runs,
          );
          yield* Console.log(
            `| ${variant} | ${n} | ${m('Types')} | ${m('Instantiations')} | ${Math.round(m('Memory used') / 1024)} MB | ${m('Check time')}s |`,
          );
        }
      }),
  );
