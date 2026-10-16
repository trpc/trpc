import * as DenoChildProcessSpawner from "@effect/platform-deno/DenoChildProcessSpawner"
import * as DenoPath from "@effect/platform-deno/DenoPath"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as PlatformError from "effect/PlatformError"
import * as Predicate from "effect/Predicate"
import { ChildProcess } from "effect/process"
import * as Stream from "effect/Stream"
import * as TestClock from "effect/testing/TestClock"
import * as ChildProcessSpawnerTest from "../../../effect/test/process/ChildProcessSpawnerTest.ts"

const platformError = (method: string, path: string, cause: unknown) =>
  PlatformError.systemError({
    _tag: Predicate.hasProperty(cause, "name") && cause.name === "NotFound" ? "NotFound" : "Unknown",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    cause
  })

const fileSystem = FileSystem.layerNoop({
  access: (path) =>
    Effect.tryPromise({
      try: () => Deno.stat(path),
      catch: (cause) => platformError("access", path, cause)
    }).pipe(Effect.asVoid),
  exists: (path) =>
    Effect.tryPromise({
      try: () => Deno.stat(path).then(() => true),
      catch: (cause) => platformError("exists", path, cause)
    }).pipe(Effect.catchTag("PlatformError", (error) =>
      error.reason._tag === "NotFound" ? Effect.succeed(false) : Effect.fail(error))),
  makeTempDirectoryScoped: (options) =>
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () => Deno.makeTempDir({ dir: options?.directory, prefix: options?.prefix }),
        catch: (cause) => platformError("makeTempDirectoryScoped", options?.directory ?? "", cause)
      }),
      (path) => Effect.promise(() => Deno.remove(path, { recursive: true })).pipe(Effect.ignore)
    ),
  writeFile: (path, data) =>
    Effect.tryPromise({
      try: () => Deno.writeFile(path, data),
      catch: (cause) => platformError("writeFile", path, cause)
    })
})

const layer = DenoChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(DenoPath.layer, fileSystem))
)

const output = (command: ChildProcess.Command) =>
  Effect.gen(function*() {
    const handle = yield* command
    return yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString)
  }).pipe(Effect.scoped, Effect.provide(layer))

ChildProcessSpawnerTest.suite("DenoChildProcessSpawner", layer, {
  processGroups: false,
  additionalFds: false
})

describe("DenoChildProcessSpawner options", () => {
  it.effect("rejects detached", () =>
    Effect.gen(function*() {
      const error = yield* ChildProcess.make("echo", ["test"], { detached: false }).pipe(Effect.flip)
      assert.deepStrictEqual(
        error.reason,
        new PlatformError.BadArgument({
          module: "ChildProcessSpawner",
          method: "spawn",
          description: "The detached option is unsupported because Deno has no equivalent"
        })
      )
    }).pipe(Effect.provide(layer)))

  it.effect("rejects additionalFds", () =>
    Effect.gen(function*() {
      const error = yield* ChildProcess.make("echo", ["test"], {
        additionalFds: { fd3: { type: "output" } }
      }).pipe(Effect.flip)
      assert.deepStrictEqual(
        error.reason,
        new PlatformError.BadArgument({
          module: "ChildProcessSpawner",
          method: "spawn",
          description: "The additionalFds option is unsupported because Deno has no equivalent"
        })
      )
    }).pipe(Effect.provide(layer)))

  it.effect("rejects additional fd pipe sources", () =>
    Effect.gen(function*() {
      const error = yield* ChildProcess.make("echo", ["test"]).pipe(
        ChildProcess.pipeTo(ChildProcess.make("cat"), { from: "fd3" }),
        Effect.flip
      )
      assert.deepStrictEqual(
        error.reason,
        new PlatformError.BadArgument({
          module: "ChildProcessSpawner",
          method: "spawn",
          description: "The additionalFds option is unsupported because Deno has no equivalent"
        })
      )
    }).pipe(Effect.provide(layer)))

  it.effect("kills every process in a pipeline", () =>
    Effect.gen(function*() {
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => Deno.makeTempDir()),
        (path) => Effect.promise(() => Deno.remove(path, { recursive: true })).pipe(Effect.ignore)
      )
      const rootHeartbeat = `${directory}/root-heartbeat`
      const childHeartbeat = `${directory}/child-heartbeat`
      const handle = yield* ChildProcess.make(
        "sh",
        ["-c", "while :; do printf x >> \"$1\"; sleep 0.01; done", "pipeline-root", rootHeartbeat]
      ).pipe(
        ChildProcess.pipeTo(
          ChildProcess.make(
            "sh",
            ["-c", "while :; do printf x >> \"$1\"; sleep 0.01; done", "pipeline-child", childHeartbeat]
          )
        )
      )

      yield* TestClock.withLive(Effect.sleep("100 millis"))
      yield* handle.kill({ killSignal: "SIGKILL" })
      const rootSizeAfterKill = (yield* Effect.promise(() => Deno.stat(rootHeartbeat))).size
      const childSizeAfterKill = (yield* Effect.promise(() => Deno.stat(childHeartbeat))).size
      yield* TestClock.withLive(Effect.sleep("100 millis"))
      const rootFinalSize = (yield* Effect.promise(() => Deno.stat(rootHeartbeat))).size
      const childFinalSize = (yield* Effect.promise(() => Deno.stat(childHeartbeat))).size

      assert.strictEqual(rootFinalSize, rootSizeAfterKill)
      assert.strictEqual(childFinalSize, childSizeAfterKill)
    }).pipe(Effect.provide(layer)))

  it.effect("emulates shell true without escaping joined arguments", () =>
    Effect.gen(function*() {
      const result = yield* output(ChildProcess.make("printf", ["[%s]", "a b"], { shell: true }))
      assert.strictEqual(result, "[a][b]")
    }))

  it.effect("uses a custom shell", () =>
    Effect.gen(function*() {
      const result = yield* output(ChildProcess.make("printf", ["custom-shell"], { shell: "/bin/sh" }))
      assert.strictEqual(result, "custom-shell")
    }))
})
