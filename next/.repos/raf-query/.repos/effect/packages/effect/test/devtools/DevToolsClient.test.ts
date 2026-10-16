import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Latch, Layer } from "effect"
import { DevToolsClient } from "effect/devtools"
import { Socket } from "effect/socket"

describe("DevToolsClient", () => {
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
