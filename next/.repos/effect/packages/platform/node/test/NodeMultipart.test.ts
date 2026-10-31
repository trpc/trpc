import * as NodeMultipart from "@effect/platform-node/NodeMultipart"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { Readable } from "node:stream"
import { setImmediate as nextTurn } from "node:timers/promises"

const headers = { "content-type": "multipart/form-data; boundary=x" }
const form = "--x\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nb\r\n--x--\r\n"
const destroy = (source: Readable, error?: Error) =>
  Effect.promise(() => {
    const closed = new Promise((resolve) => source.once("close", resolve))
    source.destroy(error)
    return closed
  })

describe("NodeMultipart", () => {
  it.effect("removes its source listeners after parsing", () =>
    Effect.gen(function*() {
      const source = Readable.from([Buffer.from(form)])
      yield* NodeMultipart.stream(source, headers).pipe(Stream.runDrain)
      yield* Effect.promise(() => nextTurn())

      assert.deepStrictEqual(source.eventNames(), [])
    }))

  it.effect("fails with a typed parse error when the source terminates early", () =>
    Effect.gen(function*() {
      const cause = new Error("boom")
      const destroyed = new Readable({ read() {} }).on("error", () => {})
      yield* destroy(destroyed, cause)
      const error = yield* NodeMultipart.stream(destroyed, headers).pipe(Stream.runDrain, Effect.flip)
      assert.strictEqual(error.reason._tag, "Parse")
      assert.strictEqual(error.reason.cause, cause)

      const closed = new Readable({ read() {} })
      closed.push("--x\r\nContent-Disposition: form-data; name=\"a\"; filename=\"a.txt\"\r\n\r\nb")
      const closedError = yield* NodeMultipart.stream(closed, headers).pipe(
        Stream.runForEach((part) => {
          closed.destroy()
          return Effect.andThen(
            Effect.promise(() => nextTurn()),
            part._tag === "File" ? Stream.runDrain(part.content) : Effect.void
          )
        }),
        Effect.flip
      )
      assert.strictEqual(closedError._tag, "MultipartError")
    }))

  it.effect("leaves the source open on interruption and handles its later error", () =>
    Effect.gen(function*() {
      const source = new Readable({ read() {} })
      source.push(form.slice(0, 20))
      const fiber = yield* NodeMultipart.stream(source, headers).pipe(Stream.runDrain, Effect.forkChild)
      yield* Effect.promise(() => nextTurn())
      yield* Fiber.interrupt(fiber)
      assert.isFalse(source.destroyed)

      yield* destroy(source, new Error("late"))
      assert.deepStrictEqual(source.eventNames(), [])
    }))

  it.effect("fails with a typed parse error when the boundary is missing", () =>
    Effect.gen(function*() {
      const body = Readable.from([
        Buffer.from("--x\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n1\r\n--x--\r\n")
      ])
      const error = yield* NodeMultipart.stream(body, { "content-type": "multipart/form-data" }).pipe(
        Stream.runCollect,
        Effect.flip
      )

      assert.strictEqual(error._tag, "MultipartError")
      assert.strictEqual(error.reason._tag, "Parse")
    }))
})
