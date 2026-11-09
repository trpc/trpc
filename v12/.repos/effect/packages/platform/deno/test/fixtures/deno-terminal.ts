import * as DenoStdio from "@effect/platform-deno/DenoStdio"
import * as DenoTerminal from "@effect/platform-deno/DenoTerminal"
import { Prompt } from "effect/cli"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Queue from "effect/Queue"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import * as Terminal from "effect/Terminal"

const TerminalLayer = Layer.mergeAll(
  DenoStdio.layer,
  DenoTerminal.layer,
  FileSystem.layerNoop({}),
  Path.layer
)

const prompts = Effect.gen(function*() {
  const first = yield* Prompt.run(Prompt.Confirm({ message: "First" }))
  const second = yield* Prompt.run(Prompt.Confirm({ message: "Second" })).pipe(Effect.flip)
  return { first, second: second._tag }
})

const readInput = Effect.scoped(
  Effect.gen(function*() {
    const terminal = yield* Terminal.Terminal
    const input = yield* terminal.readInput
    const first = yield* Queue.take(input)
    const second = yield* Queue.take(input)
    const end = yield* Effect.exit(Queue.take(input))
    return {
      first: Option.getOrNull(first.input),
      second: Option.getOrNull(second.input),
      ended: Exit.isFailure(end)
    }
  })
)

const readLine = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  const first = yield* terminal.readLine
  const second = yield* terminal.readLine.pipe(Effect.flip)
  return { first, second: second._tag }
})

const readLines = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  const first = yield* terminal.readLine
  const second = yield* terminal.readLine
  return { first, second }
})

const unused = Effect.gen(function*() {
  yield* Terminal.Terminal
  return { dataListeners: process.stdin.listenerCount("data") }
})

const readLineAfterEnd = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  yield* Effect.callback<void>((resume) => {
    if (process.stdin.readableEnded) {
      resume(Effect.void)
      return
    }
    const onEnd = () => resume(Effect.void)
    process.stdin.once("end", onEnd)
    process.stdin.resume()
    return Effect.sync(() => process.stdin.off("end", onEnd))
  })
  const error = yield* terminal.readLine.pipe(Effect.flip)
  return error._tag
})

const readLineDisposed = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  const line = yield* terminal.readLine
  const duringTtl = process.stdin.listenerCount("data")
  yield* Effect.sleep("20 millis")
  return { line, duringTtl, dataListeners: process.stdin.listenerCount("data") }
})

const interop = Effect.gen(function*() {
  const stdio = yield* Stdio.Stdio
  const terminal = yield* Terminal.Terminal
  const line = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runHead
  )
  yield* Effect.sync(() => process.stderr.write("READY\n"))
  const terminalLine = yield* terminal.readLine
  return { stdio: Option.getOrNull(line), terminal: terminalLine }
})

const mode = process.argv[2]
const program = Effect.gen(function*() {
  if (mode === "prompts") {
    return yield* prompts
  } else if (mode === "read-input") {
    return yield* readInput
  } else if (mode === "read-line") {
    return yield* readLine
  } else if (mode === "read-lines") {
    return yield* readLines
  } else if (mode === "unused") {
    return yield* unused
  } else if (mode === "read-line-after-end") {
    return yield* readLineAfterEnd
  } else if (mode === "read-line-disposed") {
    return yield* readLineDisposed
  } else if (mode === "interop") {
    return yield* interop
  }
  return yield* Effect.die(`Unknown mode: ${mode}`)
})

Effect.runPromise(program.pipe(Effect.provide(TerminalLayer))).then(
  (result) => process.stderr.write(`RESULT ${JSON.stringify(result)}\n`),
  (cause) => {
    process.stderr.write(`ERROR ${String(cause)}\n`)
    process.exitCode = 1
  }
)
