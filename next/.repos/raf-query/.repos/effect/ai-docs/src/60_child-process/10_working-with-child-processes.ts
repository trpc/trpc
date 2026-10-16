/**
 * @title Working with child processes
 *
 * This example shows how to collect process output, compose pipelines, and stream long-running command output.
 */
import { NodeServices } from "@effect/platform-node"
import { Console, Context, Effect, Layer, Schema, Stream, String } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export class DevToolsError extends Schema.TaggedError<DevToolsError>()("DevToolsError", {
  cause: Schema.Defect()
}) {}

export class DevTools extends Context.Service<DevTools, {
  readonly nodeVersion: Effect.Effect<string, DevToolsError>
  readonly recentCommitSubjects: Effect.Effect<ReadonlyArray<string>, DevToolsError>
  readonly runLintFix: Effect.Effect<void, DevToolsError>
  changedTypeScriptFiles(baseRef: string): Effect.Effect<ReadonlyArray<string>, DevToolsError>
}>()("docs/DevTools") {
  static readonly layer = Layer.effect(
    DevTools,
    Effect.gen(function*() {
      // To run child processes, we need access to a `ChildProcessSpawner`.
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      // Use `spawner.string` when you want to collect the entire output of a
      // command as a string. This runs `node --version` and collects the
      // output.
      const nodeVersion = spawner.string(
        ChildProcess.make("node", ["--version"])
      ).pipe(
        Effect.map(String.trim),
        Effect.mapError((cause) => new DevToolsError({ cause }))
      )

      const changedTypeScriptFiles = Effect.fn("DevTools.changedTypeScriptFiles")(function*(baseRef: string) {
        yield* Effect.annotateCurrentSpan({ baseRef })

        // `spawner.lines` is a convenience helper for line-oriented command
        // output.
        const files = yield* spawner.lines(
          ChildProcess.make("git", ["diff", "--name-only", `${baseRef}...HEAD`])
        ).pipe(
          Effect.mapError((cause) => new DevToolsError({ cause }))
        )

        return files.filter((file) => file.endsWith(".ts"))
      })

      // Build a pipeline from two command values. This runs:
      // `git log --pretty=format:%s -n 20 | head -n 5`
      const recentCommitSubjects = spawner.lines(
        ChildProcess.make("git", ["log", "--pretty=format:%s", "-n", "20"]).pipe(
          ChildProcess.pipeTo(ChildProcess.make("head", ["-n", "5"]))
        )
      ).pipe(
        Effect.mapError((cause) => new DevToolsError({ cause }))
      )

      const runLintFix = Effect.gen(function*() {
        // Use `spawn` when you want the process handle and stream output while
        // the process is still running.
        const handle = yield* spawner.spawn(
          ChildProcess.make("pnpm", ["lint-fix"], {
            env: { FORCE_COLOR: "1" },
            extendEnv: true
          })
        ).pipe(
          Effect.mapError((cause) => new DevToolsError({ cause }))
        )

        yield* handle.all.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => Console.log(`[lint-fix] ${line}`)),
          Effect.mapError((cause) => new DevToolsError({ cause }))
        )

        const exitCode = yield* handle.exitCode.pipe(
          Effect.mapError((cause) => new DevToolsError({ cause }))
        )

        if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
          return yield* new DevToolsError({
            cause: new Error(`pnpm lint-fix failed with exit code ${exitCode}`)
          })
        }
      }).pipe(
        // `spawner.spawn` adds a `Scope` requirement to manage the lifecycle of
        // the child process. We can use `Effect.scoped` to provide a `Scope`
        // and close it when the effect completes.
        Effect.scoped
      )

      return DevTools.of({
        nodeVersion,
        changedTypeScriptFiles,
        recentCommitSubjects,
        runLintFix
      })
    })
  ).pipe(
    // Provide the `ChildProcessSpawner` dependency from `NodeServices.layer`.
    Layer.provide(NodeServices.layer)
  )
}

export const program = Effect.gen(function*() {
  const tools = yield* DevTools

  const version = yield* tools.nodeVersion
  yield* Effect.log(`node=${version}`)
}).pipe(
  // `ChildProcess` requires a platform implementation of
  // `ChildProcessSpawner`. In Node.js, `NodeServices.layer` provides it.
  Effect.provide(DevTools.layer)
)
