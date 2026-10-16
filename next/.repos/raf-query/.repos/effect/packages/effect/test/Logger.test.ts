import { assert, describe, it } from "@effect/vitest"
import { Exit, Scope } from "effect"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as References from "effect/References"
import * as TestConsole from "effect/testing/TestConsole"

describe("Logger", () => {
  it.effect("should output logs", () =>
    Effect.gen(function*() {
      yield* Effect.logInfo("info", "message").pipe(
        Effect.annotateLogs("key", "value"),
        Effect.withLogSpan("span")
      )

      const result = yield* TestConsole.logLines

      assert.match(
        result[0] as string,
        /\[\d{2}:\d{2}:\d{2}\.\d{3}\]\sINFO\s\(#1\)\sspan=\dms:/
      )
      assert.strictEqual(result[1], "info")
      assert.strictEqual(result[2], "message")
      assert.deepStrictEqual(result[3], { key: "value" })
    }))

  it.effect(
    "replace loggers",
    Effect.fnUntraced(function*() {
      const result: Array<string> = []
      const context = yield* Layer.build(Logger.layer([Logger.formatJson.pipe(
        Logger.map((inp): void => {
          result.push(inp)
        })
      )]))
      yield* Effect.logInfo("info", "message").pipe(Effect.provideContext(context))
      assert.strictEqual(result.length, 1)
    })
  )

  it.effect("formatLogFmt does not double quote string messages or annotations", () =>
    Effect.gen(function*() {
      const result: Array<string> = []
      const logger = Logger.formatLogFmt.pipe(
        Logger.map((output): void => {
          result.push(output)
        })
      )

      yield* Effect.logInfo("Welcome to the Effect Playground!").pipe(
        Effect.annotateLogs({
          annotation1: "first",
          annotation2: "second",
          annotation3: "\"omg\""
        }),
        Effect.provide(Logger.layer([logger]))
      )

      assert.strictEqual(result.length, 1)
      const output = result[0] as string
      assert.match(output, /message="Welcome to the Effect Playground!"/)
      assert.match(output, /annotation1=first/)
      assert.match(output, /annotation2=second/)
      assert.match(output, /annotation3="\\"omg\\""/)
      assert.ok(!output.includes("message=\"\\\"Welcome to the Effect Playground!\\\"\""))
      assert.ok(!output.includes("annotation1=\"\\\"first\\\"\""))
    }))

  it.effect("formatSimple does not double quote string messages or annotations", () =>
    Effect.gen(function*() {
      const result: Array<string> = []
      const logger = Logger.formatSimple.pipe(
        Logger.map((output): void => {
          result.push(output)
        })
      )

      yield* Effect.logInfo("hello world").pipe(
        Effect.annotateLogs("annotation", "value with spaces"),
        Effect.provide(Logger.layer([logger]))
      )

      assert.strictEqual(result.length, 1)
      const output = result[0] as string
      assert.match(output, /message="hello world"/)
      assert.match(output, /annotation="value with spaces"/)
      assert.ok(!output.includes("message=\"\\\"hello world\\\"\""))
      assert.ok(!output.includes("annotation=\"\\\"value with spaces\\\"\""))
    }))

  it.effect("formats BigInt messages consistently", () =>
    Effect.gen(function*() {
      const simple: Array<string> = []
      const logFmt: Array<string> = []
      const structured: Array<{ readonly message: unknown; readonly level: string }> = []
      const json: Array<{ readonly message: unknown; readonly level: string }> = []
      const loggers = [
        Logger.formatSimple.pipe(Logger.map((output) => void simple.push(output))),
        Logger.formatLogFmt.pipe(Logger.map((output) => void logFmt.push(output))),
        Logger.formatStructured.pipe(Logger.map((output) => void structured.push(output))),
        Logger.formatJson.pipe(Logger.map((output) => void json.push(JSON.parse(output))))
      ]

      yield* Effect.logInfo(123n, { value: 123n }).pipe(Effect.provide(Logger.layer(loggers)))

      assert.include(simple[0], ` level=INFO fiber=`)
      assert.include(simple[0], `message=123n message="{\\"value\\":123n}"`)
      assert.include(logFmt[0], ` level=INFO fiber=`)
      assert.include(logFmt[0], `message=123n message="{\\"value\\":123n}"`)
      assert.deepStrictEqual(structured[0].message, [123n, { value: 123n }])
      assert.strictEqual(structured[0].level, "INFO")
      assert.deepStrictEqual(json[0].message, ["123n", { value: "123n" }])
      assert.strictEqual(json[0].level, "INFO")
    }))

  it.effect("formatJson includes the message of plain Errors", () =>
    Effect.gen(function*() {
      const json: Array<{ readonly message: unknown; readonly level: string }> = []
      const logger = Logger.formatJson.pipe(Logger.map((output) => void json.push(JSON.parse(output))))

      yield* Effect.fail(new Error("boom")).pipe(
        Effect.tapError(Effect.logError),
        Effect.ignore,
        Effect.provide(Logger.layer([logger]))
      )

      assert.strictEqual(json.length, 1)
      assert.deepStrictEqual(json[0].message, { name: "Error", message: "boom" })
      assert.strictEqual(json[0].level, "ERROR")
    }))

  it.effect("annotateLogsScoped applies annotations only while scoped", () =>
    Effect.gen(function*() {
      const annotations: Array<Record<string, unknown>> = []
      const logger = Logger.make<unknown, void>((options) => {
        annotations.push({ ...options.fiber.getRef(References.CurrentLogAnnotations) })
      })

      yield* Effect.gen(function*() {
        yield* Effect.log("before")
        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* Effect.annotateLogsScoped("requestId", "req-123")
            yield* Effect.log("inside")
          })
        )
        yield* Effect.log("after")
      }).pipe(Effect.provide(Logger.layer([logger])))

      assert.deepStrictEqual(annotations, [{}, { requestId: "req-123" }, {}])
    }))

  it.effect("annotateLogsScoped restores previous annotations", () =>
    Effect.gen(function*() {
      const annotations: Array<Record<string, unknown>> = []
      const logger = Logger.make<unknown, void>((options) => {
        annotations.push({ ...options.fiber.getRef(References.CurrentLogAnnotations) })
      })

      const scope = Scope.makeUnsafe()

      yield* Effect.gen(function*() {
        yield* Effect.log("before")
        yield* Effect.annotateLogsScoped("inner", "scope")
        yield* Effect.log("after")
      }).pipe(
        Effect.annotateLogs("outer", "program"),
        Effect.ensuring(Scope.close(scope, Exit.void)),
        Effect.andThen(Effect.log("outside")),
        Effect.provide(Logger.layer([logger]))
      )

      assert.deepStrictEqual(
        annotations,
        [{ outer: "program" }, { outer: "program", inner: "scope" }, {}]
      )
    }))

  for (const initial of [{}, { measurement: "previous" }]) {
    it.effect(`annotateLogsScoped ${"measurement" in initial ? "restores" : "removes"} NaN annotations`, () =>
      Effect.gen(function*() {
        const annotations: Array<Record<string, unknown>> = []
        const logger = Logger.make<unknown, void>(({ fiber }) => {
          annotations.push({ ...fiber.getRef(References.CurrentLogAnnotations) })
        })
        const scope = yield* Scope.make()

        yield* Effect.gen(function*() {
          yield* Effect.annotateLogsScoped("measurement", NaN)
          yield* Effect.log("inside")
          yield* Scope.close(scope, Exit.void)
          yield* Effect.log("after close")
        }).pipe(
          Scope.provide(scope),
          Effect.annotateLogs(initial),
          Effect.provide(Logger.layer([logger])),
          Effect.ensuring(Scope.close(scope, Exit.void))
        )

        assert.deepStrictEqual(annotations, [{ measurement: NaN }, initial])
      }))
  }

  it.effect("default logger preserves message item order when logging a cause", () =>
    Effect.gen(function*() {
      yield* Effect.log("first", Cause.fail("boom"), "second")

      const result = yield* TestConsole.logLines

      assert.match(
        result[0] as string,
        /\[\d{2}:\d{2}:\d{2}\.\d{3}\]\sINFO\s\(#\d+\):/
      )
      assert.strictEqual(result[1], "first")
      assert.strictEqual(result[2], "second")
      assert.match(result[3] as string, /boom/)
    }))
})
