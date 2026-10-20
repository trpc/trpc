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

/** Runs a command in `cwd` with the terminal's stdio and returns its exit code. */
export const exitCode = Effect.fn('exitCode')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* spawner.exitCode(
    ChildProcess.make(command, args, {
      cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
  return Number(code);
});

/** {@link exitCode}, failing on a non-zero exit. */
export const run = Effect.fn('run')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const code = yield* exitCode(cwd, command, args);
  if (code !== 0) {
    return yield* new CommandError({ command, args, exitCode: code });
  }
});

/**
 * Runs a command in `cwd` and returns its trimmed stdout and exit code;
 * stderr goes to the terminal.
 */
export const capture = Effect.fn('capture')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make(command, args, { cwd, stderr: 'inherit' }),
  );
  const [stdout, code] = yield* Effect.all(
    [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
    { concurrency: 'unbounded' },
  );
  return { stdout: Str.trim(stdout), exitCode: Number(code) };
}, Effect.scoped);

/** {@link capture}'s stdout, failing on a non-zero exit. */
export const output = Effect.fn('output')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const result = yield* capture(cwd, command, args);
  if (result.exitCode !== 0) {
    return yield* new CommandError({
      command,
      args,
      exitCode: result.exitCode,
    });
  }
  return result.stdout;
});

/** Non-empty lines of `text`. */
export const lines = (text: string): ReadonlyArray<string> =>
  text.split('\n').filter((line) => line !== '');
