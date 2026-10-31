import * as BunSocket from "@effect/platform-bun/BunSocket"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect } from "effect"
import { Socket } from "effect/socket"

describe("BunSocket", () => {
  it.live("passes headers and a subprotocol to the opening handshake", () =>
    Effect.gen(function*() {
      const handshake = yield* Deferred.make<{ authorization: string | undefined; protocol: string }>()
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve<{ authorization: string | undefined; protocol: string }>({
            hostname: "127.0.0.1",
            port: 0,
            fetch(request, server) {
              const protocol = request.headers.get("sec-websocket-protocol") ?? ""
              if (
                server.upgrade(request, {
                  headers: { "Sec-WebSocket-Protocol": protocol },
                  data: {
                    authorization: request.headers.get("authorization") ?? undefined,
                    protocol
                  }
                })
              ) return
              return new Response("Expected a WebSocket upgrade", { status: 400 })
            },
            websocket: {
              open(client) {
                Deferred.doneUnsafe(handshake, Effect.succeed(client.data))
              },
              message() {}
            }
          })
        ),
        (server) => Effect.promise(() => server.stop(true))
      )
      const options = {
        protocols: "graphql-transport-ws",
        headers: { Authorization: "Bearer test" }
      }
      const socket = yield* Socket.makeWebSocket(`ws://127.0.0.1:${server.port}`, options)
      yield* socket.reader
      assert.deepStrictEqual(yield* Deferred.await(handshake).pipe(Effect.timeout("1 second")), {
        authorization: "Bearer test",
        protocol: "graphql-transport-ws"
      })
    }).pipe(Effect.provide(BunSocket.layerWebSocketConstructor)))
})
