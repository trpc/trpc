/**
 * Process stdio for Deno applications.
 *
 * This module provides Effect's `Stdio` service using Deno's native process
 * arguments and Web Streams. Standard input remains open, and standard output
 * and error output are not closed unless requested through `endOnDone`.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Sink from "effect/Sink"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import { handleError } from "./internal/error.ts"

const encoder = new TextEncoder()

const output = (
  evaluate: () => WritableStream<Uint8Array>,
  method: "stdout" | "stderr",
  options?: { readonly endOnDone?: boolean | undefined }
) =>
  Sink.fromWritableStream({
    evaluate,
    onError: handleError("Stdio", method),
    closeOnDone: options?.endOnDone ?? false
  }).pipe(
    Sink.mapInput((input: string | Uint8Array) => typeof input === "string" ? encoder.encode(input) : input)
  )

/**
 * Provides the `Stdio` service backed by `Deno.args`, `Deno.stdin`,
 * `Deno.stdout`, and `Deno.stderr`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Stdio.Stdio> = Layer.succeed(
  Stdio.Stdio,
  Stdio.make({
    args: Effect.sync(() => Deno.args),
    stdinIsTerminal: Effect.sync(() => Deno.stdin.isTerminal()),
    stdoutIsTerminal: Effect.sync(() => Deno.stdout.isTerminal()),
    stdout: (options) => output(() => Deno.stdout.writable, "stdout", options),
    stderr: (options) => output(() => Deno.stderr.writable, "stderr", options),
    stdin: Stream.fromReadableStream({
      evaluate: () => Deno.stdin.readable,
      onError: handleError("Stdio", "stdin"),
      releaseLockOnEnd: true
    })
  })
)
