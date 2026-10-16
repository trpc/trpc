/**
 * Shared Node.js implementation of the Effect `Stdio` service.
 *
 * `NodeStdio` provides {@link Stdio.Stdio} from the current Node process. The
 * exported {@link layer} reads command-line arguments from `process.argv`,
 * consumes input from `process.stdin`, and writes normal and error output to
 * `process.stdout` and `process.stderr`. Standard input remains open, and
 * standard output and error output are not ended unless requested.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { systemError } from "effect/PlatformError"
import * as Stdio from "effect/Stdio"
import { fromWritable } from "./NodeSink.ts"
import { fromReadable } from "./NodeStream.ts"

/**
 * Provides `Stdio` from `process.argv`, `process.stdin`, `process.stdout`,
 * and `process.stderr`; stdin remains open and stdout/stderr are not ended by
 * default.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Stdio.Stdio> = Layer.succeed(
  Stdio.Stdio,
  Stdio.make({
    args: Effect.sync(() => process.argv.slice(2)),
    stdinIsTerminal: Effect.sync(() => process.stdin.isTTY === true),
    stdoutIsTerminal: Effect.sync(() => process.stdout.isTTY === true),
    stdout: (options) =>
      fromWritable({
        evaluate: () => process.stdout,
        onError: (cause) =>
          systemError({
            module: "Stdio",
            method: "stdout",
            _tag: "Unknown",
            cause
          }),
        endOnDone: options?.endOnDone ?? false
      }),
    stderr: (options) =>
      fromWritable({
        evaluate: () => process.stderr,
        onError: (cause) =>
          systemError({
            module: "Stdio",
            method: "stderr",
            _tag: "Unknown",
            cause
          }),
        endOnDone: options?.endOnDone ?? false
      }),
    stdin: fromReadable({
      evaluate: () => process.stdin,
      onError: (cause) =>
        systemError({
          module: "Stdio",
          method: "stdin",
          _tag: "Unknown",
          cause
        }),
      closeOnDone: false
    })
  })
)
