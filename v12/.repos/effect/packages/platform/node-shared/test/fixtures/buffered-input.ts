import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner"
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import * as NodePath from "@effect/platform-node-shared/NodePath"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as Stream from "effect/Stream"

const input = Stream.make(new Uint8Array(1024 * 1024))
const program = Effect.scoped(Effect.gen(function*() {
  // Keep the child alive without reading either input pipe. The timer also
  // bounds its lifetime if the host crashes before scoped cleanup completes.
  const handle = yield* ChildProcess.make(
    process.execPath,
    ["-e", "setTimeout(() => {}, 5000)"],
    process.argv[2] === "stdin"
      ? { stdin: input }
      : { stdin: "ignore", additionalFds: { fd3: { type: "input", stream: input } } }
  )
  return yield* handle.exitCode.pipe(Effect.timeout("100 millis"))
}))

const result = await Effect.runPromiseExit(program.pipe(
  Effect.provide(NodeChildProcessSpawner.layer.pipe(
    Layer.provide([NodeFileSystem.layer, NodePath.layer])
  ))
))
console.log("program finished:", result._tag)
await new Promise((resolve) => setTimeout(resolve, 500))
console.log("still alive after 500ms")
