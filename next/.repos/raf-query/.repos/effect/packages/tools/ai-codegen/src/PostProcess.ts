/**
 * Post-processing service for linting and formatting generated code.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"

/**
 * Error during post-processing (lint or format).
 *
 * **Example** (Creating a post-process error)
 *
 * ```ts import.meta.vitest
 * import * as PostProcess from "@effect/ai-codegen/PostProcess"
 *
 * const error = new PostProcess.PostProcessError({
 *   step: "lint",
 *   command: "pnpm exec oxlint --fix /path/to/file.ts",
 *   filePath: "/path/to/file.ts",
 *   exitCode: 1,
 *   stdout: "",
 *   stderr: "error: some lint error",
 *   cause: new Error("Lint failed")
 * })
 *
 * error.step // => "lint"
 * error.exitCode // => 1
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class PostProcessError extends Data.TaggedError("PostProcessError")<{
  readonly step: "lint" | "format"
  readonly command: string
  readonly filePath: string
  readonly exitCode?: number | undefined
  readonly stdout: string
  readonly stderr: string
  readonly cause: unknown
}> {
  override get message(): string {
    const lines: Array<string> = [
      `${this.step} failed for ${this.filePath}`,
      `command: ${this.command}`
    ]
    if (this.exitCode !== undefined) {
      lines.push(`exit code: ${this.exitCode}`)
    }
    if (this.stderr.length > 0) {
      lines.push(`stderr:\n${this.stderr}`)
    }
    if (this.stdout.length > 0) {
      lines.push(`stdout:\n${this.stdout}`)
    }
    return lines.join("\n")
  }
}

/**
 * Service for post-processing generated code.
 *
 * @category services
 * @since 4.0.0
 */
export interface PostProcessor {
  readonly lint: (filePath: string) => Effect.Effect<void, PostProcessError>
  readonly format: (filePath: string) => Effect.Effect<void, PostProcessError>
}

/**
 * Service tag for linting and formatting generated code.
 *
 * @category services
 * @since 4.0.0
 */
export const PostProcessor: Context.Service<PostProcessor, PostProcessor> = Context.Service(
  "@effect/ai-codegen/PostProcessor"
)

/**
 * Layer providing the PostProcessor service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  PostProcessor,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

  const collectStream = (stream: Stream.Stream<Uint8Array, any>) =>
    stream.pipe(
      Stream.decodeText(),
      Stream.mkString,
      Effect.orElseSucceed(() => "")
    )

  const runCommand = Effect.fn("runCommand")(function*(
    command: string,
    args: ReadonlyArray<string>,
    step: "lint" | "format",
    filePath: string
  ) {
    const fullCommand = [command, ...args].join(" ")
    const cmd = ChildProcess.make(command, args, {
      stdout: "pipe",
      stderr: "pipe"
    })

    yield* Effect.scoped(Effect.gen(function*() {
      const handle = yield* spawner.spawn(cmd).pipe(
        Effect.mapError((cause) =>
          new PostProcessError({ step, command: fullCommand, filePath, stdout: "", stderr: "", cause })
        )
      )

      const [stdout, stderr] = yield* Effect.all([
        collectStream(handle.stdout),
        collectStream(handle.stderr)
      ])

      const exitCode = yield* handle.exitCode.pipe(
        Effect.mapError((cause) =>
          new PostProcessError({ step, command: fullCommand, filePath, stdout, stderr, cause })
        )
      )

      if (exitCode !== 0) {
        return yield* new PostProcessError({
          step,
          command: fullCommand,
          filePath,
          exitCode,
          stdout,
          stderr,
          cause: new Error(`Command exited with code ${exitCode}`)
        })
      }
    }))
  })

  const lint = Effect.fn("lint")(function*(filePath: string) {
    yield* runCommand("pnpm", ["exec", "oxlint", "--silent", "--quiet", "--fix", filePath], "lint", filePath)
  })

  const format = Effect.fn("format")(function*(filePath: string) {
    yield* runCommand("pnpm", ["exec", "dprint", "--log-level", "silent", "fmt", filePath], "format", filePath)
  })

  return { lint, format }
}).pipe(Layer.effect(PostProcessor))
