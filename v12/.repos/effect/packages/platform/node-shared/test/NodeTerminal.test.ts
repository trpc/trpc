import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import { spawn, spawnSync } from "node:child_process"
import { join } from "node:path"

const resize = (columns: number, rows: number) =>
  Effect.sync(() => {
    Object.assign(process.stdout, { columns, rows })
    process.stdout.emit("resize")
  })

const mockSize = (columns: number, rows: number) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const original = { columns: process.stdout.columns, rows: process.stdout.rows }
      Object.assign(process.stdout, { columns, rows })
      return original
    }),
    (original) => Effect.sync(() => Object.assign(process.stdout, original))
  )

const fixture = join(__dirname, "fixtures", "node-terminal.ts")

const runFixture = (mode: string, input: string) =>
  spawnSync(process.execPath, [fixture, mode], {
    encoding: "utf8",
    input,
    // Includes Node startup and loading the fixture imports under CI worker load.
    timeout: 10_000
  })

const assertResult = (mode: string, input: string, expected: string) => {
  const result = runFixture(mode, input)
  assert.isUndefined(result.error)
  assert.strictEqual(result.status, 0, result.stderr)
  assert.isTrue(result.stderr.includes(`RESULT ${expected}`), result.stderr)
}

const assertOpenResult = (mode: string, input: string, expected: string) =>
  Effect.callback<void>((resume) => {
    const child = spawn(process.execPath, [fixture, mode])
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

const runOpenSelect = (input: string, customQuit = false) =>
  Effect.callback<{ stdout: string; stderr: string }>((resume) => {
    const child = spawn(process.execPath, [fixture, customQuit ? "select-custom-quit" : "select"])
    let stdout = ""
    let stderr = ""
    let submitted = false
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (data) => {
      stdout += data
      // Wait for bare Esc to be decoded before submitting the custom prompt.
      if (customQuit && !submitted && stdout.includes("\x07")) {
        submitted = true
        child.stdin.write("\r")
      }
    })
    child.stderr.on("data", (data) => {
      stderr += data
      if (stderr.includes("RESULT ")) {
        child.stdin.end()
      }
    })
    child.on("error", (error) => resume(Effect.die(error)))
    child.on("close", (code) => {
      resume(code === 0 ? Effect.succeed({ stdout, stderr }) : Effect.die(new Error(stderr)))
    })
    child.stdin.write(input)
    return Effect.sync(() => child.kill())
  })

// spawnSync blocks the Vitest worker; concurrent tests share a running timeout
// while waiting for other fixture processes to finish.
describe("NodeTerminal", { concurrent: false, timeout: 15_000 }, () => {
  it.effect("bare Esc cancels Select with QuitError and restores the cursor while stdin remains open", () =>
    Effect.gen(function*() {
      const { stderr, stdout } = yield* runOpenSelect("\x1b")
      assert.include(stderr, "RESULT \"QuitError\"", `Bare Esc output: ${JSON.stringify(stdout)}`)
      assert.include(stdout, "\x1b[?25l")
      assert.isTrue(stdout.endsWith("\x1b[?25h"), stdout)
    }))

  it.effect("an arrow escape sequence navigates Select and Enter submits", () =>
    Effect.gen(function*() {
      const { stderr } = yield* runOpenSelect("\x1b[B\r")
      assert.include(stderr, "RESULT \"banana\"")
    }))

  it.effect("an explicit shouldQuit predicate can keep Esc non-cancelling", () =>
    Effect.gen(function*() {
      const { stderr, stdout } = yield* runOpenSelect("\x1b", true)
      assert.include(stdout, "\x07")
      assert.include(stderr, "RESULT \"apple\"")
    }))

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

  it("leaves a TTY in cooked mode for readLine", () => {
    assertResult("tty-read-line", "line\n", "{\"line\":\"line\",\"rawMode\":[]}")
  })

  it("enables raw mode on a TTY while reading key input", () => {
    assertResult("tty-read-input", "y", "{\"input\":\"y\",\"rawMode\":[true,false]}")
  })

  it.effect("disposes readline after its idle TTL", () =>
    assertOpenResult(
      "read-line-disposed",
      "line\n",
      "{\"line\":\"line\",\"duringTtl\":1,\"dataListeners\":0}"
    ))

  it.effect("size offers the current size, then only the latest resize", () =>
    Effect.gen(function*() {
      yield* mockSize(80, 24)
      const terminal = yield* NodeTerminal.make()
      const sizes = yield* terminal.size
      assert.deepStrictEqual(yield* Queue.take(sizes), { columns: 80, rows: 24 })
      yield* resize(100, 30)
      yield* resize(120, 50)
      assert.deepStrictEqual(yield* Queue.takeAll(sizes), [{ columns: 120, rows: 50 }])
    }))

  it.effect("size removes its resize listener when the scope closes", () =>
    Effect.gen(function*() {
      const terminal = yield* NodeTerminal.make()
      const listeners = process.stdout.listenerCount("resize")
      yield* terminal.size.pipe(
        Effect.tap(() => Effect.sync(() => assert.strictEqual(process.stdout.listenerCount("resize"), listeners + 1))),
        Effect.scoped
      )
      assert.strictEqual(process.stdout.listenerCount("resize"), listeners)
    }))
})
