import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as NetAddress from "effect/net/NetAddress"
import * as References from "effect/References"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import { mkdtemp, rm } from "node:fs/promises"
import * as Net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

const fetchText = (url: string) =>
  Effect.promise(() => fetch(url, { headers: { connection: "close" } }).then((response) => response.text()))

const readWebSocketClose = (port: number, opened: Deferred.Deferred<void>, path = "/") =>
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
        `GET ${path} HTTP/1.1`,
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
        if (!received.subarray(0, headerEnd).toString().startsWith("HTTP/1.1 101")) {
          resume(Effect.fail(new Error("WebSocket upgrade was refused")))
          return
        }
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

// Force-stop Bun after the close frame; graceful stop can hang here.
const makeForceStoppableServer = Effect.gen(function*() {
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
  return { server, forceStop: () => forceStop?.() }
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
  describe("serve scope ownership", { concurrent: false }, () => {
    it.live("closes the request scope when a streaming body is cancelled synchronously during construction", () =>
      Effect.gen(function*() {
        let finalized = false
        let pulled = false
        let cancellation: Promise<void> | undefined
        const OriginalResponse = globalThis.Response
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            // Intercept construction: awaiting a response over HTTP lets the first pull run already.
            globalThis.Response = class extends OriginalResponse {
              constructor(body?: BodyInit | null, init?: ResponseInit) {
                if (body instanceof ReadableStream) {
                  cancellation = body.cancel()
                  super(null, init)
                } else {
                  super(body, init)
                }
              }
            }
          }),
          () =>
            Effect.sync(() => {
              globalThis.Response = OriginalResponse
            })
        )
        yield* HttpServer.serveEffect(Effect.gen(function*() {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              finalized = true
            })
          )
          return HttpServerResponse.stream(Stream.fromEffect(Effect.sync(() => {
            pulled = true
            return new Uint8Array([1])
          })))
        }))
        const response = yield* HttpClient.get("/")
        assert.strictEqual(response.status, 200)
        yield* response.text
        assert.isDefined(cancellation)
        yield* Effect.promise(() => cancellation!)
        assert.strictEqual(pulled, false)
        assert.strictEqual(finalized, true)
      }).pipe(Effect.timeout("2 seconds"), Effect.provide(BunHttpServer.layerTest)))

    it.live("interrupts a streaming body suspended during startup when the serve scope closes", () =>
      Effect.gen(function*() {
        let finalized = false
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0, disablePreemptiveShutdown: true })
        // Let the body finish on teardown so the server can stop if it was never interrupted.
        yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
        const serveScope = yield* Scope.fork(yield* Effect.scope)
        yield* server.serve(Effect.gen(function*() {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              finalized = true
            })
          )
          // The body suspends during startup, before it can serve a pull.
          return HttpServerResponse.stream(
            Stream.transformPull(
              Stream.empty,
              (pull) =>
                Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(pull))
            )
          )
        })).pipe(Scope.provide(serveScope))
        // Not awaited: headers may not be sent while the body is suspended.
        fetch(NetAddress.formatUrlUnsafe(server.address), { headers: { connection: "close" } }).catch(() => undefined)
        yield* Deferred.await(started)
        assert.strictEqual(finalized, false)
        yield* Scope.close(serveScope, Exit.void)
        assert.strictEqual(finalized, true)
      }).pipe(Effect.timeout("2 seconds")))
  })

  for (const kind of ["serveEffect", "uninterruptible route"] as const) {
    it.live(`closes the request scope when ${kind} returns a stream after client abort`, () =>
      Effect.gen(function*() {
        const closed = yield* Deferred.make<void>()
        const controller = new AbortController()
        const handler = Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Deferred.succeed(closed, undefined))
          const request = yield* HttpServerRequest.HttpServerRequest
          const signal = (request.source as Request).signal
          // Wait for Bun to observe the disconnect before returning the response.
          yield* Effect.callback<void>((resume) => {
            const onAbort = () => resume(Effect.void)
            signal.addEventListener("abort", onAbort, { once: true })
            controller.abort()
            return Effect.sync(() => signal.removeEventListener("abort", onAbort))
          })
          const chunk = new TextEncoder().encode("body")
          return HttpServerResponse.stream(Stream.concat(Stream.succeed(chunk), Stream.succeed(chunk)))
        })
        if (kind === "serveEffect") {
          yield* HttpServer.serveEffect(handler)
        } else {
          yield* HttpRouter.add("GET", "/", handler, { uninterruptible: true }).pipe(
            HttpRouter.serve,
            Layer.build
          )
        }
        const server = yield* HttpServer.HttpServer
        const aborted = yield* Effect.promise(() =>
          fetch(NetAddress.formatUrlUnsafe(server.address), { signal: controller.signal }).then(
            () => false,
            () => true
          )
        )
        assert.isTrue(aborted)
        yield* Deferred.await(closed).pipe(Effect.timeout("2 seconds"))
      }).pipe(Effect.provide(BunHttpServer.layerTest)), 5000)
  }

  it.live("keeps quiet response streams open unless an idle timeout is configured", () =>
    Effect.gen(function*() {
      const quietStream = Effect.fnUntraced(function*(idleTimeout?: number) {
        const server = yield* BunHttpServer.make({
          hostname: "127.0.0.1",
          port: 0,
          gracefulShutdownTimeout: "100 millis",
          ...(idleTimeout === undefined ? {} : { idleTimeout })
        })
        yield* server.serve(Effect.succeed(HttpServerResponse.stream(Stream.concat(
          Stream.succeed(new TextEncoder().encode("a")),
          // Longer than Bun's 10 second default idle timeout plus its timer granularity.
          Stream.fromEffect(Effect.as(Effect.sleep("15 seconds"), new TextEncoder().encode("b")))
        ))))
        return yield* Effect.exit(fetchText(NetAddress.formatUrlUnsafe(server.address)))
      })
      const [omitted, explicit] = yield* Effect.all([Effect.scoped(quietStream()), Effect.scoped(quietStream(1))], {
        concurrency: "unbounded"
      })
      assert.deepStrictEqual(omitted, Exit.succeed("ab"))
      assert.isTrue(Exit.hasDies(explicit))
    }).pipe(Effect.timeout("25 seconds")), 30000)

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

  it.effect("returns 413 for a body over MaxBodySize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/body",
        HttpServerRequest.HttpServerRequest.use((request) => Effect.as(request.text, HttpServerResponse.empty())).pipe(
          Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4))
        )
      ).pipe(HttpRouter.serve, Layer.build)
      const response = yield* HttpClient.post("/body", { body: HttpBody.text("12345") })
      assert.strictEqual(response.status, 413)
    }).pipe(Effect.provide(BunHttpServer.layerTest)))

  it.effect("answers CONNECT with 501 without running the app", () =>
    Effect.gen(function*() {
      let calls = 0
      yield* HttpRouter.add(
        "*",
        "*",
        Effect.sync(() => {
          calls++
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      // fetch cannot send CONNECT.
      const statusLine = yield* Effect.callback<string, Error>((resume) => {
        const socket = Net.createConnection({ host: "127.0.0.1", port })
        let received = ""
        socket.on("connect", () => socket.write("CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n"))
        socket.on("error", (error) => resume(Effect.fail(error)))
        socket.on("data", (chunk) => {
          received += chunk.toString()
          const lineEnd = received.indexOf("\r\n")
          if (lineEnd !== -1) resume(Effect.succeed(received.slice(0, lineEnd)))
        })
        socket.on("close", () => resume(Effect.succeed(received)))
        return Effect.sync(() => socket.destroy())
      })
      assert.strictEqual(statusLine.split(" ")[1], "501")
      assert.strictEqual(calls, 0)
    }).pipe(Effect.provide(BunHttpServer.layerTest)))

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
        const logged = yield* Deferred.make<unknown>()
        const logger = Logger.make((options) => {
          const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
          if (annotations["http.url"] === "/") Deferred.doneUnsafe(logged, Effect.succeed(annotations["http.status"]))
        })
        const { forceStop, server } = yield* makeForceStoppableServer
        yield* server.serve(
          Effect.gen(function*() {
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
          }),
          HttpMiddleware.logger
        ).pipe(Effect.provide(Logger.layer([logger])))
        yield* Effect.addFinalizer(() => Effect.sync(forceStop))
        const port = (server.address as NetAddress.InetAddress).port
        const actual = yield* readWebSocketClose(port, opened)
        forceStop()
        assert.strictEqual(actual, code)
        if (exit === "success") assert.strictEqual(yield* Deferred.await(logged), 101)
      }).pipe(Effect.timeout("5 seconds")), 10000)
  }

  it.effect("logs status 101 for a WebSocket upgraded through a prefixed route", () =>
    Effect.gen(function*() {
      const opened = yield* Deferred.make<void>()
      const logged = yield* Deferred.make<unknown>()
      const logger = Logger.make((options) => {
        const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
        if (annotations["http.url"] === "/ws") Deferred.doneUnsafe(logged, Effect.succeed(annotations["http.status"]))
      })
      const app = yield* HttpRouter.toHttpEffect(HttpRouter.use((router) =>
        router.prefixed("/ws").add(
          "GET",
          "/",
          Effect.gen(function*() {
            const request = yield* HttpServerRequest.HttpServerRequest
            const socket = yield* request.upgrade
            const readerScope = yield* Scope.fork(yield* Effect.scope)
            yield* socket.reader.pipe(Scope.provide(readerScope))
            yield* Deferred.await(opened)
            return HttpServerResponse.empty()
          })
        )
      ))
      const { forceStop, server } = yield* makeForceStoppableServer
      yield* server.serve(app, HttpMiddleware.logger).pipe(Effect.provide(Logger.layer([logger])))
      yield* Effect.addFinalizer(() => Effect.sync(forceStop))
      const port = (server.address as NetAddress.InetAddress).port
      const actual = yield* readWebSocketClose(port, opened, "/ws")
      forceStop()
      assert.strictEqual(actual, 1000)
      assert.strictEqual(yield* Deferred.await(logged), 101)
    }).pipe(Effect.timeout("5 seconds")), 10000)

  it.effect("logs status 101 when the client closes an upgraded WebSocket", () =>
    Effect.gen(function*() {
      const logged = yield* Deferred.make<unknown>()
      const logger = Logger.make((options) => {
        const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
        if (annotations["http.url"] === "/") Deferred.doneUnsafe(logged, Effect.succeed(annotations["http.status"]))
      })
      const app = yield* HttpRouter.toHttpEffect(HttpRouter.add(
        "GET",
        "/",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* request.upgrade
          const reader = yield* socket.reader
          yield* reader.pull.pipe(Effect.forever, Effect.ignore)
          return HttpServerResponse.empty()
        })
      ))
      const { forceStop, server } = yield* makeForceStoppableServer
      yield* server.serve(app, HttpMiddleware.logger).pipe(Effect.provide(Logger.layer([logger])))
      yield* Effect.addFinalizer(() => Effect.sync(forceStop))
      const port = (server.address as NetAddress.InetAddress).port
      const ws = new WebSocket(`ws://127.0.0.1:${port}/`)
      ws.addEventListener("open", () => ws.close(1000))
      assert.strictEqual(yield* Deferred.await(logged), 101)
    }).pipe(Effect.timeout("5 seconds")), 10000)

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

  it.effect("fails upgrades to protocols other than WebSocket", () =>
    Effect.gen(function*() {
      const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 })
      yield* server.serve(Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const error = yield* Effect.flip(request.upgrade)
        return HttpServerResponse.text(error.reason.message, { status: 501 })
      }))
      const port = (server.address as NetAddress.InetAddress).port
      const response = yield* Effect.promise(() =>
        fetch(`http://127.0.0.1:${port}/attach`, {
          method: "POST",
          headers: { connection: "Upgrade", upgrade: "tcp" }
        })
      )
      assert.strictEqual(response.status, 501)
      assert.include(yield* Effect.promise(() => response.text()), "Bun.serve only supports WebSocket upgrades")
    }))
})
