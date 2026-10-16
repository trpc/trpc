import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { assert, describe, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as NetAddress from "effect/net/NetAddress"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import { mkdtemp, rm } from "node:fs/promises"
import * as Net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

const fetchText = (url: string) =>
  Effect.promise(() => fetch(url, { headers: { connection: "close" } }).then((response) => response.text()))

const readWebSocketClose = (port: number, opened: Deferred.Deferred<void>) =>
  Effect.callback<number, Error>((resume) => {
    const socket = Net.createConnection({ host: "127.0.0.1", port })
    let received = Buffer.alloc(0)
    let upgraded = false
    let closeCode: number | undefined
    socket.on("close", () => {
      if (closeCode !== undefined) resume(Effect.succeed(closeCode))
    })
    socket.on("connect", () =>
      socket.write([
        "GET / HTTP/1.1",
        "Host: 127.0.0.1:" + port,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "",
        ""
      ].join("\r\n")))
    socket.on("error", (error) => resume(Effect.fail(error)))
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, typeof chunk === "string" ? Buffer.from(chunk) : chunk])
      if (!upgraded) {
        const headerEnd = received.indexOf("\r\n\r\n")
        if (headerEnd === -1) return
        upgraded = true
        received = received.subarray(headerEnd + 4)
        Effect.runSync(Deferred.succeed(opened, undefined))
      }
      if (received.length < 4 || (received[0] & 0x0f) !== 8) return
      if (closeCode !== undefined) return
      closeCode = received.readUInt16BE(2)
      socket.write(Buffer.from([0x88, 0x82, 0, 0, 0, 0, closeCode >> 8, closeCode & 0xff]))
    })
    return Effect.sync(() => socket.destroy())
  })

interface WebSocketFrame {
  readonly opcode: number
  readonly payload: Uint8Array
  readonly payloadLength: number
  readonly rsv1: boolean
}

interface WebSocketFrames {
  readonly frames: ReadonlyArray<WebSocketFrame>
  readonly headers: string
}

const readWebSocketFrames = (port: number, perMessageDeflate: boolean) =>
  Effect.callback<WebSocketFrames, Error>((resume) => {
    const socket = Net.createConnection({ host: "127.0.0.1", port })
    let received = Buffer.alloc(0)
    let result: WebSocketFrames | undefined

    socket.on("connect", () => {
      socket.write([
        "GET / HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...(perMessageDeflate ? ["Sec-WebSocket-Extensions: permessage-deflate"] : []),
        "",
        ""
      ].join("\r\n"))
    })
    socket.on("error", (error) => resume(Effect.fail(error)))
    socket.on("close", () => {
      if (result) resume(Effect.succeed(result))
    })
    socket.on("data", (chunk) => {
      if (result) return
      received = Buffer.concat([received, typeof chunk === "string" ? Buffer.from(chunk) : chunk])
      const headerEnd = received.indexOf("\r\n\r\n")
      if (headerEnd === -1) return

      const headers = received.subarray(0, headerEnd).toString()
      const frames: Array<WebSocketFrame> = []
      let offset = headerEnd + 4
      while (frames.length < 2) {
        if (received.length < offset + 2) return
        const first = received[offset]
        const length = received[offset + 1] & 0x7f
        const headerLength = length === 126 ? 4 : 2
        if (received.length < offset + headerLength) return
        const payloadLength = length === 126 ? received.readUInt16BE(offset + 2) : length
        if (received.length < offset + headerLength + payloadLength) return
        frames.push({
          opcode: first & 0x0f,
          payload: Uint8Array.from(received.subarray(offset + headerLength, offset + headerLength + payloadLength)),
          payloadLength,
          rsv1: (first & 0x40) !== 0
        })
        offset += headerLength + payloadLength
      }
      result = { frames, headers }
      socket.write(Buffer.from([0x88, 0x82, 0, 0, 0, 0, 0x03, 0xe8]))
    })

    return Effect.sync(() => socket.destroy())
  })

const makeWebSocketServer = Effect.fnUntraced(function*(payload: string, compressionThreshold?: number) {
  const server = yield* BunHttpServer.make({
    hostname: "127.0.0.1",
    port: 0,
    websocket: { perMessageDeflate: true, compressionThreshold }
  })
  yield* server.serve(Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const socket = yield* request.upgrade
    yield* Effect.gen(function*() {
      const { pull } = yield* socket.reader
      const writer = yield* socket.writer
      yield* Effect.orDie(writer.write(payload))
      yield* Effect.orDie(writer.write(new TextEncoder().encode(payload)))
      while (true) {
        yield* pull
      }
    }).pipe(
      Effect.scoped,
      Effect.catchTag("SocketError", () => Effect.void),
      Effect.orDie
    )
    return HttpServerResponse.empty()
  }))
  return server
})

describe("BunHttpServer", () => {
  describe("body omission", () => {
    for (const status of [204, 205, 304]) {
      for (const bodyKind of ["text", "stream"]) {
        it.live(`omits ${bodyKind} bodies for status ${status}`, () =>
          Effect.gen(function*() {
            let finalized = false
            let streamStarted = false
            yield* HttpServer.serveEffect(Effect.gen(function*() {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  finalized = true
                })
              )
              const options = { status, contentType: "text/plain", contentLength: 4 }
              return bodyKind === "text"
                ? HttpServerResponse.text("body", options)
                : HttpServerResponse.stream(
                  Stream.fromEffect(Effect.sync(() => {
                    streamStarted = true
                    return new TextEncoder().encode("body")
                  })),
                  options
                )
            }))
            const response = yield* HttpClient.get("/")
            assert.strictEqual(response.status, status)
            assert.strictEqual(yield* response.text, "")
            assert.strictEqual(streamStarted, false)
            assert.strictEqual(finalized, true)
            if (status === 304) {
              assert.strictEqual(response.headers["content-type"], "text/plain")
            }
          }).pipe(
            Effect.timeout("2 seconds"),
            Effect.provide(BunHttpServer.layerTest)
          ), 5000)
      }
    }

    for (const [method, status] of [["HEAD", 200], ["GET", 204], ["GET", 205], ["GET", 304]] as const) {
      it.live(`cancels raw streams for ${method} status ${status}`, () =>
        Effect.gen(function*() {
          let cancelled = false
          const body = new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new TextEncoder().encode("body"))
              controller.close()
            },
            cancel() {
              cancelled = true
            }
          }, { highWaterMark: 0 })
          yield* Effect.addFinalizer(() => Effect.ignoreCause(Effect.promise(() => body.cancel())))
          yield* HttpServer.serveEffect(Effect.succeed(HttpServerResponse.raw(body, {
            status,
            contentType: "text/plain",
            contentLength: 4
          })))
          const response = yield* (method === "HEAD" ? HttpClient.head("/") : HttpClient.get("/"))
          assert.strictEqual(response.status, status)
          assert.strictEqual(yield* response.text, "")
          assert.strictEqual(cancelled, true)
          if (method === "HEAD") {
            assert.strictEqual(response.headers["content-length"], "4")
          }
          if (method === "HEAD" || status === 304) {
            assert.strictEqual(response.headers["content-type"], "text/plain")
          }
        }).pipe(
          Effect.timeout("2 seconds"),
          Effect.provide(BunHttpServer.layerTest)
        ), 5000)
    }
  })

  for (
    const [name, options, expectedTag, expectedIp] of [
      ["omitted hostname", { port: 0 }, "InetAddressV6", "::"],
      ["undefined Unix path and omitted hostname", { port: 0, unix: undefined }, "InetAddressV6", "::"],
      ["explicit wildcard hostname", { port: 0, hostname: "0.0.0.0" }, "InetAddressV4", "0.0.0.0"]
    ] as const
  ) {
    it.effect(`starts a layer with ${name}`, () =>
      Effect.gen(function*() {
        const server = yield* HttpServer.HttpServer
        if (server.address._tag !== expectedTag) {
          return assert.fail(`expected ${expectedTag}, got ${server.address._tag}`)
        }
        assert.strictEqual(NetAddress.formatIp(server.address.address), expectedIp)
        assert.isAbove(server.address.port, 0)

        yield* server.serve(Effect.succeed(HttpServerResponse.text("default hostname")))
        const client = yield* HttpServer.makeTestClient.pipe(Effect.provide(FetchHttpClient.layer))
        const response = yield* client.get("/")
        assert.strictEqual(response.status, 200)
        assert.strictEqual(yield* response.text, "default hostname")
      }).pipe(Effect.provide(BunHttpServer.layer(options))))
  }

  it.effect("treats an undefined Unix path as a TCP listener", () =>
    Effect.gen(function*() {
      for (const hostname of ["localhost", "127.0.0.1"]) {
        const server = yield* BunHttpServer.make({ unix: undefined, hostname, port: 0 })
        assert.isTrue(server.address._tag === "InetAddressV4" || server.address._tag === "InetAddressV6")
        yield* server.serve(Effect.succeed(HttpServerResponse.text("tcp")))
        const client = yield* HttpServer.makeTestClient.pipe(
          Effect.provideService(HttpServer.HttpServer, server),
          Effect.provide(FetchHttpClient.layer)
        )
        const response = yield* client.get("/")
        assert.strictEqual(yield* response.text, "tcp")
      }
    }))

  it.effect("resolves hostnames and formats Unix socket addresses", () =>
    Effect.gen(function*() {
      const server = yield* BunHttpServer.make({ hostname: "localhost", port: 0 })
      assert.isTrue(server.address._tag === "InetAddressV4" || server.address._tag === "InetAddressV6")

      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "bun-http-"))),
        (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true }))
      )
      const path = join(directory, "server.sock")
      const unixServer = yield* BunHttpServer.make({ unix: path })

      assert.strictEqual(unixServer.address._tag, "UnixPathAddress")
      assert.strictEqual(unixServer.address._tag === "UnixPathAddress" ? unixServer.address.path : undefined, path)
      assert.strictEqual(NetAddress.formatUrlUnsafe(unixServer.address), `unix://${path}`)
    }))

  it.effect("closing an older serve scope keeps the newer handler active", () =>
    Effect.gen(function*() {
      const ownerScope = yield* Effect.scope
      const server = yield* BunHttpServer.make({
        hostname: "127.0.0.1",
        port: 0
      })
      const firstScope = yield* Scope.fork(ownerScope)
      const secondScope = yield* Scope.fork(ownerScope)

      yield* server.serve(Effect.succeed(HttpServerResponse.text("first"))).pipe(Scope.provide(firstScope))
      yield* server.serve(Effect.succeed(HttpServerResponse.text("second"))).pipe(Scope.provide(secondScope))
      const url = NetAddress.formatUrlUnsafe(server.address)

      assert.strictEqual(yield* fetchText(url), "second")
      yield* Scope.close(firstScope, Exit.void)
      assert.strictEqual(yield* fetchText(url), "second")
    }))

  it.effect("closing the newer serve scope restores the older handler", () =>
    Effect.gen(function*() {
      const ownerScope = yield* Effect.scope
      const server = yield* BunHttpServer.make({
        hostname: "127.0.0.1",
        port: 0
      })
      const firstScope = yield* Scope.fork(ownerScope)
      const secondScope = yield* Scope.fork(ownerScope)

      yield* server.serve(Effect.succeed(HttpServerResponse.text("first"))).pipe(Scope.provide(firstScope))
      yield* server.serve(Effect.succeed(HttpServerResponse.text("second"))).pipe(Scope.provide(secondScope))
      const url = NetAddress.formatUrlUnsafe(server.address)

      assert.strictEqual(yield* fetchText(url), "second")
      yield* Scope.close(secondScope, Exit.void)
      assert.strictEqual(yield* fetchText(url), "first")
    }))

  it.effect("preserves configured routes while changing handlers", () =>
    Effect.gen(function*() {
      const ownerScope = yield* Effect.scope
      const server = yield* BunHttpServer.make({
        hostname: "127.0.0.1",
        port: 0,
        routes: { "/static": new Response("static") }
      })
      const firstScope = yield* Scope.fork(ownerScope)
      const secondScope = yield* Scope.fork(ownerScope)
      const url = NetAddress.formatUrlUnsafe(server.address)

      yield* server.serve(Effect.succeed(HttpServerResponse.text("first"))).pipe(Scope.provide(firstScope))
      assert.strictEqual(yield* fetchText(`${url}/static`), "static")
      assert.strictEqual(yield* fetchText(`${url}/fallback`), "first")

      yield* server.serve(Effect.succeed(HttpServerResponse.text("second"))).pipe(Scope.provide(secondScope))
      assert.strictEqual(yield* fetchText(`${url}/static`), "static")
      assert.strictEqual(yield* fetchText(`${url}/fallback`), "second")

      yield* Scope.close(secondScope, Exit.void)
      assert.strictEqual(yield* fetchText(`${url}/static`), "static")
      assert.strictEqual(yield* fetchText(`${url}/fallback`), "first")
    }))

  it.effect("compresses outgoing WebSocket messages when per-message deflate is negotiated", () =>
    Effect.gen(function*() {
      const payload = "a".repeat(4_096)
      const server = yield* makeWebSocketServer(payload)
      const port = (server.address as NetAddress.InetAddress).port
      const { frames, headers } = yield* readWebSocketFrames(port, true)

      assert.match(headers, /^sec-websocket-extensions:.*permessage-deflate/im)
      assert.deepStrictEqual(frames.map((frame) => frame.opcode), [1, 2])
      assert.isTrue(frames.every((frame) => frame.rsv1))
      assert.isTrue(frames.every((frame) => frame.payloadLength < payload.length))
    }))

  it.effect("leaves small WebSocket messages uncompressed even when per-message deflate is negotiated", () =>
    Effect.gen(function*() {
      const payload = "a".repeat(64)
      const server = yield* makeWebSocketServer(payload)
      const port = (server.address as NetAddress.InetAddress).port
      const { frames, headers } = yield* readWebSocketFrames(port, true)

      assert.match(headers, /^sec-websocket-extensions:.*permessage-deflate/im)
      assert.deepStrictEqual(frames.map((frame) => frame.opcode), [1, 2])
      assert.isFalse(frames.some((frame) => frame.rsv1))
      assert.isTrue(frames.every((frame) => frame.payloadLength === payload.length))
    }))

  it.effect("compresses small WebSocket messages when below a custom compressionThreshold", () =>
    Effect.gen(function*() {
      const payload = "a".repeat(64)
      const server = yield* makeWebSocketServer(payload, 32)
      const port = (server.address as NetAddress.InetAddress).port
      const { frames } = yield* readWebSocketFrames(port, true)

      assert.deepStrictEqual(frames.map((frame) => frame.opcode), [1, 2])
      assert.isTrue(frames.every((frame) => frame.rsv1))
      assert.isTrue(frames.every((frame) => frame.payloadLength < payload.length))
    }))

  it.effect("supports WebSocket clients without per-message deflate", () =>
    Effect.gen(function*() {
      const payload = "a".repeat(4_096)
      const server = yield* makeWebSocketServer(payload)
      const port = (server.address as NetAddress.InetAddress).port
      const { frames, headers } = yield* readWebSocketFrames(port, false)

      assert.notMatch(headers, /^sec-websocket-extensions:.*permessage-deflate/im)
      assert.deepStrictEqual(frames.map((frame) => frame.opcode), [1, 2])
      assert.isFalse(frames.some((frame) => frame.rsv1))
      assert.isTrue(frames.every((frame) => frame.payloadLength === payload.length))
      assert.deepStrictEqual(frames.map((frame) => new TextDecoder().decode(frame.payload)), [payload, payload])
    }))

  for (
    const [name, exit, code] of [
      ["success", "success", 1000],
      ["interrupt", "interrupt", 1001],
      ["failure", "failure", 1011],
      ["defect", "defect", 1011],
      ["explicit close before failure", "explicit", 4400]
    ] as const
  ) {
    it.effect(`closes a WebSocket with the handler's ${name} code`, () =>
      Effect.gen(function*() {
        const opened = yield* Deferred.make<void>()
        // Force-stop Bun after the close frame; graceful stop can hang here.
        const serve = Bun.serve
        let forceStop: (() => void) | undefined
        Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
          const bunServer = serve(options)
          forceStop = () => {
            bunServer.stop(true)
          }
          return bunServer
        }) as typeof Bun.serve
        const server = yield* BunHttpServer.make({
          hostname: "127.0.0.1",
          port: 0,
          gracefulShutdownTimeout: "100 millis"
        }).pipe(Effect.ensuring(Effect.sync(() => {
          Bun.serve = serve
        })))
        yield* server.serve(Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* request.upgrade
          const readerScope = yield* Scope.fork(yield* Effect.scope)
          yield* socket.reader.pipe(Scope.provide(readerScope))
          yield* Deferred.await(opened)
          if (exit === "explicit") {
            const writer = yield* socket.writer
            yield* writer.write(new Socket.CloseEvent(4400, "handler closed"))
          }
          if (exit === "interrupt") return yield* Effect.interrupt
          if (exit === "failure" || exit === "explicit") return yield* Effect.fail(new Error("handler failed"))
          if (exit === "defect") return yield* Effect.die(new Error("handler defect"))
          return HttpServerResponse.empty()
        }))
        yield* Effect.addFinalizer(() => Effect.sync(() => forceStop?.()))
        const port = (server.address as NetAddress.InetAddress).port
        const actual = yield* readWebSocketClose(port, opened)
        forceStop?.()
        assert.strictEqual(actual, code)
      }).pipe(Effect.timeout("5 seconds")), 10000)
  }

  it.effect("fails a concurrent reader waiting behind a closed reader", () =>
    Effect.gen(function*() {
      const secondReaderFailed = yield* Deferred.make<boolean>()
      const server = yield* BunHttpServer.make({
        hostname: "127.0.0.1",
        port: 0
      })
      yield* server.serve(Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const socket = yield* request.upgrade
        const ownerScope = yield* Effect.scope
        const firstScope = yield* Scope.fork(ownerScope)
        const secondScope = yield* Scope.fork(ownerScope)

        const { pull } = yield* socket.reader.pipe(Scope.provide(firstScope))
        const writer = yield* socket.writer
        const secondReader = yield* socket.reader.pipe(
          Scope.provide(secondScope),
          Effect.exit,
          Effect.forkChild({ startImmediately: true })
        )
        yield* writer.write("first")
        yield* writer.write("second")
        yield* Effect.exit(pull)
        yield* Scope.close(firstScope, Exit.void)
        const secondExit = yield* Fiber.join(secondReader)
        yield* Scope.close(secondScope, Exit.void)
        yield* Deferred.succeed(secondReaderFailed, Exit.isFailure(secondExit))
        return HttpServerResponse.empty()
      }))

      const port = (server.address as NetAddress.InetAddress).port
      yield* readWebSocketFrames(port, false)
      const failed = yield* Deferred.await(secondReaderFailed)
      assert.isTrue(failed)
    }))
})
