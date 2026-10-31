import { assert, describe, it } from "@effect/vitest"
import { Deferred, type Duration, Effect, Fiber, Latch, Layer } from "effect"
import { DevTools, DevToolsClient } from "effect/devtools"
import { Socket } from "effect/socket"
import { TestClock } from "effect/testing"

const refused = Effect.fail(
  new Socket.SocketError({
    reason: new Socket.SocketOpenError({ kind: "Unknown", cause: "connection refused" })
  })
)

// Sends a Pong, then stays idle until the reader scope closes or the
// connection drops.
const connection = Effect.fnUntraced(function*(options?: { readonly dropAfter?: Duration.Input }) {
  const closed = Latch.makeUnsafe(false)
  yield* Effect.addFinalizer(() => closed.open)
  let sent = false
  return {
    pull: Effect.suspend(() => {
      if (!sent) {
        sent = true
        return Effect.succeed(["{\"_tag\":\"Pong\"}\n"] as const)
      }
      const disconnected = options?.dropAfter === undefined
        ? closed.await
        : Effect.raceFirst(Effect.sleep(options.dropAfter), closed.await)
      return Effect.andThen(
        disconnected,
        Effect.fail(new Socket.SocketError({ reason: new Socket.SocketCloseError({ code: 1006 }) }))
      )
    }),
    upgrade: () => Effect.fail(new Socket.SocketError({ reason: new Socket.SocketUpgradeError({}) }))
  }
})

describe("DevToolsClient", () => {
  it.effect("builds promptly when the server only responds to client messages", () =>
    Effect.gen(function*() {
      const ping = yield* Deferred.make<void>()
      const write = Effect.fnUntraced(function*(chunk: Uint8Array | string | Socket.CloseEvent) {
        if (Socket.isCloseEvent(chunk)) return
        const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
        if (text.trim().split("\n").some((line) => JSON.parse(line)._tag === "Ping")) {
          yield* Deferred.succeed(ping, void 0)
        }
      })
      const socket = Socket.make({
        reader: Effect.gen(function*() {
          // Model asynchronous connection setup before waiting for the client Ping.
          yield* Effect.sleep("1 millis")
          yield* Effect.addFinalizer(() => Deferred.succeed(ping, void 0))
          const reader = yield* connection()
          return { ...reader, pull: Effect.andThen(Deferred.await(ping), reader.pull) }
        }),
        writer: Effect.succeed({ write, writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true }) })
      })
      const built = yield* Deferred.make<void>()
      yield* Layer.build(DevTools.layerSocket).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.andThen(Deferred.succeed(built, void 0)),
        Effect.forkScoped
      )

      yield* TestClock.adjust("100 millis")
      assert.isTrue(yield* Deferred.isDone(built))
    }))

  it.effect("closes its scope while the endpoint remains unavailable", () =>
    Effect.gen(function*() {
      let unavailable = true
      const socket = Socket.make({
        // Restore connectivity only for cleanup after observing shutdown.
        reader: Effect.suspend(() => unavailable ? refused : connection()),
        writer: Effect.succeed({ write: () => Effect.void, writeAll: () => Effect.void })
      })
      const closed = yield* Deferred.make<void>()
      const fiber = yield* DevToolsClient.make.pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.scoped,
        Effect.andThen(Deferred.succeed(closed, void 0)),
        Effect.forkScoped
      )

      yield* TestClock.adjust("5 seconds")
      const closedDuringOutage = yield* Deferred.isDone(closed)
      unavailable = false
      yield* TestClock.adjust("2 seconds")
      yield* Fiber.join(fiber)

      assert.isTrue(closedDuringOutage)
    }))

  for (const scenario of ["healthy", "startup refusal", "connection loss"] as const) {
    it.effect(`sends later spans after ${scenario}`, () =>
      Effect.gen(function*() {
        const spans: Array<{ name: string; status: { _tag: string } }> = []
        let firstConnection = true
        const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
          Effect.sync(() => {
            if (Socket.isCloseEvent(chunk)) return
            const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
            for (const line of text.trim().split("\n")) {
              if (line.length === 0) continue
              const message = JSON.parse(line)
              if (message._tag === "Span" && message.name === "later") spans.push(message)
            }
          })
        const socket = Socket.make({
          reader: Effect.suspend(() => {
            const first = firstConnection
            firstConnection = false
            if (!first) return connection()
            switch (scenario) {
              case "healthy":
                return connection()
              case "startup refusal":
                return refused
              case "connection loss":
                return connection({ dropAfter: "10 seconds" })
            }
          }),
          writer: Effect.succeed({
            write,
            writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true })
          })
        })

        const fiber = yield* Effect.gen(function*() {
          yield* Effect.sleep("1 minute")
          yield* Effect.void.pipe(Effect.withSpan("later"))
          // Allow delivery before closing the client layer.
          yield* Effect.sleep("10 seconds")
        }).pipe(
          Effect.provide(DevToolsClient.layerTracer.pipe(Layer.provide(Layer.succeed(Socket.Socket, socket)))),
          Effect.forkScoped
        )
        yield* TestClock.adjust("2 minutes")
        yield* Fiber.join(fiber)

        assert.deepStrictEqual(spans.map((span) => span.status._tag), ["Started", "Ended"])
      }))
  }

  it.effect("sends a short-lived span once in each state", () =>
    Effect.gen(function*() {
      const spans: Array<any> = []
      const received = yield* Deferred.make<void>()
      const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
        Effect.sync(() => {
          if (Socket.isCloseEvent(chunk)) return false
          const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
          for (const line of text.trim().split("\n")) {
            if (line.length === 0) continue
            const message = JSON.parse(line)
            if (message._tag === "Span") spans.push(message)
          }
          return spans.length >= 2
        }).pipe(
          Effect.flatMap((done) => done ? Deferred.succeed(received, void 0) : Effect.void),
          Effect.asVoid
        )
      const socket = Socket.make({
        // sends one message, then stays idle until the reader scope closes,
        // which fails the suspended pull as the reader contract requires
        reader: Effect.gen(function*() {
          const closed = Latch.makeUnsafe(false)
          yield* Effect.addFinalizer(() => closed.open)
          let sent = false
          return {
            pull: Effect.suspend(() => {
              if (sent) {
                return Effect.andThen(
                  closed.await,
                  Effect.fail(new Socket.SocketError({ reason: new Socket.SocketCloseError({ code: 1000 }) }))
                )
              }
              sent = true
              return Effect.succeed(["{\"_tag\":\"Pong\"}\n"] as const)
            }),
            upgrade: () =>
              Effect.fail(
                new Socket.SocketError({
                  reason: new Socket.SocketUpgradeError({})
                })
              )
          }
        }),
        writer: Effect.succeed({
          write,
          writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true })
        })
      })

      yield* Effect.gen(function*() {
        yield* Effect.void.pipe(Effect.withSpan("child"))
        yield* Deferred.await(received)
      }).pipe(
        Effect.provide(
          DevToolsClient.layerTracer.pipe(
            Layer.provide(Layer.succeed(Socket.Socket, socket))
          )
        )
      )

      assert.deepStrictEqual(spans.map((span) => span.status._tag), ["Started", "Ended"])
    }))
})
