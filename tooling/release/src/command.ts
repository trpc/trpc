import { Data, Effect, Stream, String as Str } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

export class CommandError extends Data.TaggedError('CommandError')<{
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly exitCode: number;
}> {
  override get message() {
    return `${this.command} ${this.args.join(' ')} exited with ${this.exitCode}`;
  }
}

/** Runs `command` in `cwd` with the terminal attached. Fails on a non-zero exit. */
export const run = Effect.fn('run')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(command, args, {
      cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new CommandError({ command, args, exitCode });
  }
});

/** Runs `command` in `cwd` and returns its trimmed stdout. Fails on a non-zero exit. */
export const output = Effect.fn('output')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make(command, args, { cwd, stderr: 'inherit' }),
  );
  const [stdout, exitCode] = yield* Effect.all(
    [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
    { concurrency: 'unbounded' },
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new CommandError({ command, args, exitCode });
  }
  return Str.trim(stdout);
}, Effect.scoped);

export const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  output(cwd, 'git', args);
