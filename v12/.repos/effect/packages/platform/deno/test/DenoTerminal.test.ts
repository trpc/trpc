import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const fixture = fileURLToPath(new URL("fixtures/deno-terminal.ts", import.meta.url))

const runFixture = (mode: string, input: string) =>
  spawnSync(Deno.execPath(), [fixture, mode], {
    encoding: "utf8",
    input,
    timeout: 2_000
  })

const assertResult = (mode: string, input: string, expected: string) => {
  const result = runFixture(mode, input)
  assert.isUndefined(result.error)
  assert.strictEqual(result.status, 0, result.stderr)
  assert.isTrue(result.stderr.includes(`RESULT ${expected}`), result.stderr)
}

const assertOpenResult = (mode: string, input: string, expected: string) =>
  Effect.callback<void>((resume) => {
    const child = spawn(Deno.execPath(), [fixture, mode])
    let stderr = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (data) => {
      stderr += data
      if (stderr.includes("RESULT ")) {
        child.stdin.end()
      }
    })
    child.on("exit", (code) => {
      resume(
        code === 0 && stderr.includes(`RESULT ${expected}`)
          ? Effect.void
          : Effect.die(new Error(stderr))
      )
    })
    child.stdin.write(input)
    return Effect.sync(() => child.kill())
  })

const assertInteropResult = Effect.callback<void>((resume) => {
  const child = spawn(Deno.execPath(), [fixture, "interop"])
  let stderr = ""
  let sentTerminalInput = false
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (data) => {
    stderr += data
    if (!sentTerminalInput && stderr.includes("READY")) {
      sentTerminalInput = true
      child.stdin.end("terminal\n")
    }
  })
  child.on("exit", (code) => {
    resume(
      code === 0 && stderr.includes("RESULT {\"stdio\":\"stdio\",\"terminal\":\"terminal\"}")
        ? Effect.void
        : Effect.die(new Error(stderr))
    )
  })
  child.stdin.write("stdio\n")
  return Effect.sync(() => child.kill())
})

// spawnSync blocks the Vitest worker; concurrent tests share a running timeout
// while waiting for other fixture processes to finish.
describe("DenoTerminal", { concurrent: false }, () => {
  it("does not install a readline interface until the terminal is used", () => {
    assertResult("unused", "", "{\"dataListeners\":0}")
  })

  it("fails a prompt with QuitError after piped input is exhausted", () => {
    assertResult("prompts", "y\n", "{\"first\":true,\"second\":\"QuitError\"}")
  })

  it("delivers buffered keypresses before ending the input queue", () => {
    assertResult("read-input", "yn", "{\"first\":\"y\",\"second\":\"n\",\"ended\":true}")
  })

  it("flushes an unterminated line before failing readLine with QuitError at EOF", () => {
    assertResult("read-line", "last line", "{\"first\":\"last line\",\"second\":\"QuitError\"}")
  })

  it("preserves lines buffered between sequential readLine calls", () => {
    assertResult("read-lines", "first\nsecond\n", "{\"first\":\"first\",\"second\":\"second\"}")
  })

  it("fails readLine with QuitError when stdin ended before initialization", () => {
    assertResult("read-line-after-end", "", "\"QuitError\"")
  })

  it.effect("disposes readline after its idle TTL", () =>
    assertOpenResult(
      "read-line-disposed",
      "line\n",
      "{\"line\":\"line\",\"duringTtl\":1,\"dataListeners\":0}"
    ))

  it.effect("interoperates with DenoStdio on stdin", () => assertInteropResult)
})
