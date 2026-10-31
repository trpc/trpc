import * as Effect from "effect/Effect"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import { NpmPromoteError } from "./NpmPromoteError.ts"

/**
 * Runs a command and returns its stdout. A non-zero exit code fails with the
 * command's combined output.
 */
export const run = (
  command: string,
  args: ReadonlyArray<string>,
  options?: { readonly cwd?: string | undefined }
): Effect.Effect<string, NpmPromoteError, ChildProcessSpawner.ChildProcessSpawner> => {
  const display = `${command} ${args.join(" ")}`
  return Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(ChildProcess.make(command, args, { cwd: options?.cwd }))
    const [stdout, stderr, exitCode] = yield* Effect.all([
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode
    ], { concurrency: "unbounded" })
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new NpmPromoteError({ message: `Command failed (${display}):\n${stderr}\n${stdout}`.trim() })
    }
    return stdout
  }).pipe(
    Effect.scoped,
    Effect.catchTag(
      "PlatformError",
      (cause) => Effect.fail(new NpmPromoteError({ message: `Could not run command (${display})`, cause }))
    )
  )
}
