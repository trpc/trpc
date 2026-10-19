/**
 * What the bench commands share: failures, Markdown tables, writing a
 * generated project and running `tsc` for its diagnostics.
 */
import { Data, Effect, FileSystem, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

export const here = import.meta.dirname;
export const generated = `${here}/.generated`;

export class BenchFailed extends Data.TaggedError('BenchFailed')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

export const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new BenchFailed({ step, cause }),
  });

export const median = (xs: ReadonlyArray<number>): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

export const table = (
  head: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

export const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

export const writeFiles = (
  dir: string,
  files: ReadonlyArray<readonly [string, string]>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.remove(dir, { recursive: true, force: true });
    for (const [file, contents] of files) {
      const target = path.join(dir, file);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, contents);
    }
  });

const tsc = `${here}/node_modules/.bin/tsc`;
// v11 and oRPC are checked from their published `.d.ts` (with `skipLibCheck`), so v12 is too.
export const dist = `${here}/../../packages/trpc/dist`;

export const requireDist = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(`${dist}/server/index.d.ts`))) {
    return yield* new BenchFailed({
      step: 'typecheck',
      cause: 'run `pnpm build` first',
    });
  }
});

/** `tsc -p <project> --extendedDiagnostics --singleThreaded`: its numbers by name. */
export const diagnostics = (project: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(tsc, [
          '-p',
          project,
          '--extendedDiagnostics',
          '--singleThreaded',
        ]),
      );
      const [output, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      if (exitCode !== 0) {
        return yield* new BenchFailed({
          step: `tsc ${project}`,
          cause: output.slice(0, 4000),
        });
      }
      const numbers: Record<string, number> = {};
      for (const line of output.split('\n')) {
        const m = /^([A-Za-z ]+):\s+([\d.]+)/.exec(line.trim());
        if (m) numbers[m[1]!.trim()] = Number(m[2]);
      }
      return numbers;
    }),
  );

/** Medians of `runs` diagnostics of one project, by name. */
export const medianDiagnostics = (project: string, runs: number) =>
  Effect.map(
    Effect.replicateEffect(diagnostics(project), runs),
    (samples) => (name: string) => median(samples.map((s) => s[name] ?? NaN)),
  );

/** The `tsconfig.json` of a generated project, reading v12 from its `.d.ts`. */
export const fixtureTsconfig = (include: ReadonlyArray<string>) =>
  JSON.stringify(
    {
      compilerOptions: {
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'bundler',
        moduleDetection: 'force',
        lib: ['esnext', 'dom'],
        types: [],
        strict: true,
        noUncheckedIndexedAccess: true,
        isolatedModules: true,
        skipLibCheck: true,
        noEmit: true,
        incremental: false,
        paths: { '@trpc12/trpc/*': [`${dist}/*/index.d.ts`] },
      },
      include,
    },
    null,
    2,
  );
