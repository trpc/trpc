import { NodeSocket, NodeSocketServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Option, Queue, Redacted } from "effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as NetAddress from "effect/net/NetAddress"
import * as Scope from "effect/Scope"
import { Socket } from "effect/socket"
import * as Stream from "effect/Stream"
import * as Fs from "node:fs"
import * as Net from "node:net"
import { Duplex, PassThrough } from "node:stream"
import * as Tls from "node:tls"
import { fileURLToPath } from "node:url"
import { vi } from "vitest"
import { WS } from "vitest-websocket-mock"

vi.mock("node:net", async (importOriginal) => {
  const original = await importOriginal<typeof Net>()
  return { ...original, createConnection: vi.fn(original.createConnection) }
})

vi.mock("node:tls", async (importOriginal) => {
  const original = await importOriginal<typeof Tls>()
  return { ...original, connect: vi.fn(original.connect) }
})

// Regenerate with:
// openssl req -x509 -newkey ed25519 -nodes -days 36500 -subj /CN=localhost \
//   -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -keyout key.pem -out cert.pem
const cert = Fs.readFileSync(fileURLToPath(new URL("./fixtures/tls/cert.pem", import.meta.url)))
const key = Fs.readFileSync(fileURLToPath(new URL("./fixtures/tls/key.pem", import.meta.url)))

const echoHandler = (socket: Socket.Socket, upgradeOptions?: Socket.TlsUpgradeOptions) =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const { pull, upgrade } = yield* socket.reader
    if (upgradeOptions !== undefined) {
      yield* upgrade(upgradeOptions)
    }
    while (true) {
      yield* writer.writeAll(yield* pull)
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("SocketError", () => Effect.void)
  )

const makePassThrough = Effect.acquireRelease(
  Effect.sync(() => new PassThrough()),
  (duplex) => Effect.sync(() => duplex.destroy())
)

// A duplex-backed reader with one pull parked, waiting for bytes.
const parkedPull = Effect.gen(function*() {
  const duplex = yield* makePassThrough
  const { pull } = yield* (yield* NodeSocket.fromDuplex(Effect.succeed(duplex))).reader
  const parked = yield* Effect.forkChild(pull, { startImmediately: true })
  return { duplex, pull, parked }
})

const decode = (batch: ReadonlyArray<Uint8Array | string>) =>
  Buffer.concat(batch.map((chunk) => Buffer.from(chunk))).toString()

const sendHelloWorld = (socket: Socket.Socket, upgradeOptions?: Socket.TlsUpgradeOptions) =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const { pull, upgrade } = yield* socket.reader
    if (upgradeOptions !== undefined) {
      yield* upgrade(upgradeOptions)
    }
    yield* writer.writeAll(["Hello", "World"])
    const decoder = new TextDecoder()
    let text = ""
    while (text.length < 10) {
      for (const chunk of yield* pull) {
        text += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      }
    }
    return text
  }).pipe(Effect.scoped)

const makeServer = Effect.gen(function*() {
  const server = yield* NodeSocketServer.make({ port: 0 })
  yield* server.run(echoHandler).pipe(Effect.forkScoped)
  return server
})

describe("Socket", () => {
  it.live("preserves a native IPv6 listener address", () =>
    Effect.gen(function*() {
      const server = yield* NodeSocketServer.make({ host: "::1", port: 0 })
      assert.strictEqual(server.address._tag, "InetAddressV6")
      if (server.address._tag !== "InetAddressV6") return
      assert.strictEqual(server.address.address.toString(), "::1")
      assert.notStrictEqual(server.address.port, 0)
    }))

  it.live("closes with a pending pre-run socket", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const server = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 }).pipe(Scope.provide(scope))
      assert.strictEqual(server.address._tag, "InetAddressV4")
      if (server.address._tag !== "InetAddressV4") return
      const socket = Net.createConnection({ host: "127.0.0.1", port: server.address.port })
      yield* Effect.promise(() =>
        new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve)
          socket.once("error", reject)
        })
      )
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
      const exit = yield* Fiber.await(closing).pipe(
        Effect.timeout("1 second"),
        Effect.ensuring(Effect.sync(() => socket.destroy()))
      )
      assert.isTrue(Exit.isSuccess(exit))
    }))

  it.live("closes with a pending pre-run WebSocket", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const server = yield* NodeSocketServer.makeWebSocket({ host: "127.0.0.1", port: 0 }).pipe(Scope.provide(scope))
      assert.strictEqual(server.address._tag, "InetAddressV4")
      if (server.address._tag !== "InetAddressV4") return
      const socket = new NodeSocket.NodeWS.WebSocket(`ws://127.0.0.1:${server.address.port}`)
      yield* Effect.promise(() =>
        new Promise<void>((resolve, reject) => {
          socket.once("open", resolve)
          socket.once("error", reject)
        })
      )
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
      const exit = yield* Fiber.await(closing).pipe(
        Effect.timeout("1 second"),
        Effect.ensuring(Effect.sync(() => socket.terminate()))
      )
      assert.isTrue(Exit.isSuccess(exit))
    }))

  it.effect("open", () =>
    Effect.gen(function*() {
      const server = yield* makeServer
      const channel = NodeSocket.makeNetChannel({ port: (server.address as NetAddress.InetAddress).port })

      const outputEffect = Stream.make("Hello", "World").pipe(
        Stream.encodeText,
        Stream.pipeThroughChannel(channel),
        Stream.catchIf(
          (error) => error.reason._tag === "SocketCloseError",
          () => Stream.empty
        ),
        Stream.decodeText(),
        Stream.mkString
      )

      const output = yield* outputEffect
      assert.strictEqual(output, "HelloWorld")
    }))

  it.effect("pull batches", () =>
    Effect.gen(function*() {
      const server = yield* makeServer
      const socket = yield* NodeSocket.makeNet({ port: (server.address as NetAddress.InetAddress).port })

      const received = yield* Effect.gen(function*() {
        const writer = yield* socket.writer
        const pull = yield* Socket.readerBytes(socket)
        yield* writer.writeAll(["Hello", "World"])
        const received: Array<Uint8Array> = []
        let length = 0
        while (length < 10) {
          const chunk = yield* pull
          for (const data of chunk) {
            received.push(data)
            length += data.byteLength
          }
        }
        return received
      }).pipe(Effect.scoped)

      const text = new TextDecoder().decode(
        received.reduce((acc, chunk) => {
          const next = new Uint8Array(acc.byteLength + chunk.byteLength)
          next.set(acc, 0)
          next.set(chunk, acc.byteLength)
          return next
        }, new Uint8Array(0))
      )
      assert.strictEqual(text, "HelloWorld")
    }))

  it.effect("pull drains every buffered duplex chunk", () =>
    Effect.gen(function*() {
      const first = Buffer.from("aa")
      const second = Buffer.from("bb")
      const duplex = new Duplex({
        read() {},
        write() {}
      })
      duplex.pause()
      const socket = yield* NodeSocket.fromDuplex(Effect.succeed(duplex))
      const { pull } = yield* socket.reader
      duplex.push(first)
      duplex.push(second)
      const batch = yield* pull
      assert.strictEqual(Buffer.concat(batch.map((chunk) => chunk as Uint8Array)).toString(), "aabb")
      // Node 26 returns one buffered chunk per `read()`, so the batch carries
      // the pushed buffers with no copy. Earlier Node concatenates them.
      if (batch.length === 2) {
        assert.strictEqual(batch[0], first)
        assert.strictEqual(batch[1], second)
      }
    }))

  it.live("handles reader scope closure during a parked pull read", () =>
    Effect.gen(function*() {
      const duplex = yield* makePassThrough
      const socket = yield* NodeSocket.fromDuplex(Effect.succeed(duplex))
      const readScope = yield* Scope.make()
      yield* Effect.addFinalizer(() => Scope.close(readScope, Exit.void))
      const { pull } = yield* Scope.provide(socket.reader, readScope)
      const parked = yield* Effect.forkChild(pull, { startImmediately: true })
      let observed = ""
      duplex.once("data", (chunk) => {
        observed = chunk.toString()
        Effect.runSync(Scope.close(readScope, Exit.void))
      })

      // Deliver synchronously so an exception stays in the test, rather than
      // escaping from Node's next-tick readable notification.
      duplex.write("hello")
      duplex.emit("readable")
      const error = yield* Fiber.join(parked).pipe(Effect.flip, Effect.timeout("1 second"))
      assert.strictEqual(observed, "hello")
      assert.strictEqual(error.reason._tag, "SocketCloseError")
      if (error.reason._tag === "SocketCloseError") {
        assert.strictEqual(error.reason.code, 1006)
      }
    }))

  it.live("preserves a chunk when a parked pull is interrupted during read", () =>
    Effect.gen(function*() {
      const { duplex, parked, pull } = yield* parkedPull
      duplex.once("data", () => Effect.runSync(Fiber.interrupt(parked)))
      duplex.write("hello")
      duplex.emit("readable")
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(parked).pipe(Effect.timeout("1 second"))))
      const next = yield* pull.pipe(Effect.timeout("1 second"))
      assert.strictEqual(decode(next), "hello")
    }))

  it.live("drains a retained chunk when EOF follows parked pull interruption", () =>
    Effect.gen(function*() {
      const { duplex, parked, pull } = yield* parkedPull
      duplex.once("data", () => Effect.runSync(Fiber.interrupt(parked)))
      const ended = new Promise<void>((resolve) => duplex.once("end", resolve))
      duplex.end("hello")
      duplex.emit("readable")
      yield* Effect.promise(() => ended).pipe(Effect.timeout("1 second"))
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(parked)))
      const next = yield* pull.pipe(Effect.timeout("1 second"))
      assert.strictEqual(decode(next), "hello")
      const error = yield* Effect.flip(pull).pipe(Effect.timeout("1 second"))
      assert.strictEqual(error.reason._tag, "SocketCloseError")
      if (error.reason._tag === "SocketCloseError") {
        assert.strictEqual(error.reason.code, 1000)
      }
    }))

  it.live("preserves order when a parked pull is replaced synchronously during read", () =>
    Effect.gen(function*() {
      const { duplex, parked, pull } = yield* parkedPull
      const scope = yield* Effect.scope
      let replacement: Fiber.Fiber<ReadonlyArray<Uint8Array | string>, Socket.SocketError> | undefined
      duplex.once("data", () => {
        Effect.runSync(Fiber.interrupt(parked))
        // Make the second chunk available only after read() consumes the first,
        // so this also exercises separate reads on Node versions that coalesce.
        duplex.write("second")
        replacement = Effect.runSync(Effect.forkIn(pull, scope, { startImmediately: true }))
      })
      duplex.write("first")
      duplex.emit("readable")
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(parked)))
      assert.isDefined(replacement)
      let received = decode(yield* Fiber.join(replacement).pipe(Effect.timeout("1 second")))
      while (received.length < "firstsecond".length) {
        received += decode(yield* pull.pipe(Effect.timeout("1 second")))
      }
      assert.strictEqual(received, "firstsecond")
    }))

  it.live("respects a zero open timeout", () =>
    Effect.gen(function*() {
      const socket = yield* NodeSocket.fromDuplex(Effect.never, { openTimeout: 0 })
      const error = yield* Effect.scoped(Effect.asVoid(socket.reader)).pipe(
        Effect.flip,
        Effect.timeout("1 second")
      )
      assert.strictEqual(error.reason._tag, "SocketOpenError")
      if (error.reason._tag === "SocketOpenError") {
        assert.strictEqual(error.reason.kind, "Timeout")
      }
    }))

  it.live("destroys a pending TCP connection on open timeout", () => {
    const conn = new Net.Socket()
    const destroy = vi.spyOn(conn, "destroy")
    const destroySoon = vi.spyOn(conn, "destroySoon").mockImplementation(() => {})
    vi.mocked(Net.createConnection).mockReturnValueOnce(conn)

    return Effect.gen(function*() {
      const socket = yield* NodeSocket.makeNet({ host: "127.0.0.1", port: 1, openTimeout: 0 })
      yield* Effect.scoped(Effect.asVoid(socket.reader)).pipe(Effect.flip)
      assert.isTrue(destroy.mock.calls.length > 0)
      assert.strictEqual(destroySoon.mock.calls.length, 0)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        destroy.mockRestore()
        destroySoon.mockRestore()
        conn.destroy()
      }))
    )
  })

  it.live("gracefully closes an established TCP connection", () => {
    const conn = new Net.Socket()
    const destroy = vi.spyOn(conn, "destroy")
    const destroySoon = vi.spyOn(conn, "destroySoon").mockImplementation(() => {})
    vi.mocked(Net.createConnection).mockImplementationOnce(() => {
      queueMicrotask(() => conn.emit("connect"))
      return conn
    })

    return Effect.gen(function*() {
      const socket = yield* NodeSocket.makeNet({ host: "127.0.0.1", port: 1 })
      yield* Effect.scoped(Effect.asVoid(socket.reader))
      assert.strictEqual(destroy.mock.calls.length, 0)
      assert.isTrue(destroySoon.mock.calls.length > 0)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        destroy.mockRestore()
        destroySoon.mockRestore()
        conn.destroy()
      }))
    )
  })

  describe("TLS", () => {
    const makeTlsServer = Effect.suspend(() => {
      const sockets = new Set<Tls.TLSSocket>()
      return Effect.acquireRelease(
        Effect.callback<Tls.Server>((resume) => {
          const server = Tls.createServer({ cert, key }, (socket) => {
            sockets.add(socket)
            socket.on("close", () => sockets.delete(socket))
            socket.pipe(socket)
          })
          server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)))
        }),
        (server) =>
          Effect.sync(() => {
            for (const socket of sockets) socket.destroy()
            server.close()
          })
      )
    })

    const serverPort = (server: Tls.Server) => (server.address() as Net.AddressInfo).port

    it.effect("open", () =>
      Effect.gen(function*() {
        const server = yield* makeTlsServer
        const channel = NodeSocket.makeTlsChannel({
          host: "127.0.0.1",
          port: serverPort(server),
          ca: [cert]
        })

        const output = yield* Stream.make("Hello", "World").pipe(
          Stream.encodeText,
          Stream.pipeThroughChannel(channel),
          Stream.catchIf(
            (error) => error.reason._tag === "SocketCloseError",
            () => Stream.empty
          ),
          Stream.decodeText(),
          Stream.mkString
        )
        assert.strictEqual(output, "HelloWorld")
      }))

    it.effect("echoes over the reader and writer", () =>
      Effect.gen(function*() {
        const server = yield* makeTlsServer
        const socket = yield* NodeSocket.makeTls({
          host: "127.0.0.1",
          port: serverPort(server),
          ca: [cert]
        })

        const received = yield* sendHelloWorld(socket)

        assert.strictEqual(received, "HelloWorld")
      }))

    it.effect("fails to open against an untrusted certificate", () =>
      Effect.gen(function*() {
        const server = yield* makeTlsServer
        const socket = yield* NodeSocket.makeTls({
          host: "127.0.0.1",
          port: serverPort(server)
        })

        const error = yield* Effect.scoped(Effect.asVoid(socket.reader)).pipe(Effect.flip)
        assert.strictEqual(error.reason._tag, "SocketOpenError")
        if (error.reason._tag === "SocketOpenError") {
          assert.strictEqual(error.reason.kind, "Unknown")
          assert.strictEqual((error.reason.cause as { code?: string }).code, "DEPTH_ZERO_SELF_SIGNED_CERT")
        }
      }))

    it.live("destroys a pending TLS connection on open timeout", () => {
      const conn = new Tls.TLSSocket(new Net.Socket())
      const destroy = vi.spyOn(conn, "destroy")
      const destroySoon = vi.spyOn(conn, "destroySoon").mockImplementation(() => {})
      vi.mocked(Tls.connect).mockReturnValueOnce(conn)

      return Effect.gen(function*() {
        const socket = yield* NodeSocket.makeTls({ host: "127.0.0.1", port: 1, openTimeout: 0 })
        yield* Effect.scoped(Effect.asVoid(socket.reader)).pipe(Effect.flip)
        assert.isTrue(destroy.mock.calls.length > 0)
        assert.strictEqual(destroySoon.mock.calls.length, 0)
      }).pipe(
        Effect.ensuring(Effect.sync(() => {
          destroy.mockRestore()
          destroySoon.mockRestore()
          conn.destroy()
        }))
      )
    })

    it.effect("echoes through a NodeSocketServer.makeTls server", () =>
      Effect.gen(function*() {
        const server = yield* NodeSocketServer.makeTls({ host: "127.0.0.1", port: 0, cert, key })
        yield* server.run(echoHandler).pipe(Effect.forkScoped)

        const socket = yield* NodeSocket.fromDuplex(Effect.acquireRelease(
          Effect.callback<Tls.TLSSocket>((resume) => {
            const conn = Tls.connect({
              host: "127.0.0.1",
              port: (server.address as NetAddress.InetAddress).port,
              ca: [cert]
            })
            conn.once("secureConnect", () => resume(Effect.succeed(conn)))
          }),
          (conn) => Effect.sync(() => conn.destroy())
        ))

        const received = yield* sendHelloWorld(socket)

        assert.strictEqual(received, "HelloWorld")
      }))

    it.effect("upgrades a plain NodeSocketServer connection to TLS", () =>
      Effect.gen(function*() {
        const server = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 })
        yield* server.run((socket) => echoHandler(socket, { cert, key: Redacted.make(key) })).pipe(
          Effect.forkScoped
        )

        const socket = yield* NodeSocket.makeTls({
          host: "127.0.0.1",
          port: (server.address as NetAddress.InetAddress).port,
          ca: [cert]
        })

        const received = yield* sendHelloWorld(socket)

        assert.strictEqual(received, "HelloWorld")
      }))

    it.effect("upgrades a makeNet client connection to TLS", () =>
      Effect.gen(function*() {
        const server = yield* NodeSocketServer.makeTls({ host: "127.0.0.1", port: 0, cert, key })
        yield* server.run(echoHandler).pipe(Effect.forkScoped)

        const socket = yield* NodeSocket.makeNet({
          host: "127.0.0.1",
          port: (server.address as NetAddress.InetAddress).port
        })

        const received = yield* sendHelloWorld(socket, {
          ca: [cert],
          rejectUnauthorized: true
        })

        assert.strictEqual(received, "HelloWorld")
      }))

    it.live("requires both key and cert for server TLS upgrades", () =>
      Effect.gen(function*() {
        const raw = new Duplex({
          read() {},
          write(_chunk, _encoding, callback) {
            callback()
          }
        })
        const socket = yield* NodeSocket.fromDuplex(Effect.succeed(raw), { tlsServer: true })

        const error = yield* Effect.gen(function*() {
          const { upgrade } = yield* socket.reader
          return yield* upgrade().pipe(Effect.flip)
        }).pipe(Effect.scoped)

        assert.strictEqual(error.reason._tag, "SocketUpgradeError")
        if (error.reason._tag === "SocketUpgradeError") {
          assert.strictEqual((error.reason.cause as Error).message, "server TLS upgrade requires both key and cert")
        }
      }))

    it.live("rejects incomplete client credentials", () =>
      Effect.gen(function*() {
        const raw = new Duplex({
          read() {},
          write(_chunk, _encoding, callback) {
            callback()
          }
        })
        const socket = yield* NodeSocket.fromDuplex(Effect.succeed(raw))

        const error = yield* Effect.gen(function*() {
          const { upgrade } = yield* socket.reader
          return yield* upgrade({ cert }).pipe(Effect.flip)
        }).pipe(Effect.scoped)

        assert.strictEqual(error.reason._tag, "SocketUpgradeError")
        if (error.reason._tag === "SocketUpgradeError") {
          assert.strictEqual(
            (error.reason.cause as Error).message,
            "TLS upgrade credentials must include both key and cert"
          )
        }
      }))

    it.live("fails pulls after an interrupted TLS upgrade", () =>
      Effect.gen(function*() {
        const raw = new Duplex({
          read() {},
          write(_chunk, _encoding, callback) {
            callback()
          }
        })
        const tls = new Duplex({
          read() {},
          write(_chunk, _encoding, callback) {
            callback()
          }
        })
        vi.mocked(Tls.connect).mockReturnValueOnce(tls as Tls.TLSSocket)
        const socket = yield* NodeSocket.fromDuplex(Effect.succeed(raw))

        const error = yield* Effect.gen(function*() {
          const { pull, upgrade } = yield* socket.reader
          const upgradeFiber = yield* upgrade().pipe(Effect.forkChild({ startImmediately: true }))
          yield* Fiber.interrupt(upgradeFiber)
          return yield* pull.pipe(Effect.flip, Effect.timeout("1 second"))
        }).pipe(Effect.scoped)

        assert.strictEqual(error.reason._tag, "SocketCloseError")
      }))

    it.live("rejects a second TLS upgrade", () =>
      Effect.gen(function*() {
        const server = yield* NodeSocketServer.makeTls({ host: "127.0.0.1", port: 0, cert, key })
        yield* server.run((socket) =>
          Effect.gen(function*() {
            yield* Effect.asVoid(socket.reader)
            return yield* Effect.never
          }).pipe(Effect.scoped)
        ).pipe(Effect.forkScoped)
        const socket = yield* NodeSocket.makeNet({
          host: "127.0.0.1",
          port: (server.address as NetAddress.InetAddress).port
        })

        const error = yield* Effect.gen(function*() {
          const { upgrade } = yield* socket.reader
          const options = {
            cert,
            key: Redacted.make(key),
            ca: [cert],
            rejectUnauthorized: true
          }
          yield* upgrade(options)
          return yield* upgrade(options).pipe(
            Effect.flip,
            Effect.timeout("1 second")
          )
        }).pipe(Effect.scoped)

        assert.strictEqual(error.reason._tag, "SocketUpgradeError")
      }))

    it.effect("reports TLS handshake failures as SocketUpgradeError", () =>
      Effect.gen(function*() {
        const server = yield* NodeSocketServer.makeTls({ host: "127.0.0.1", port: 0, cert, key })
        yield* server.run(() => Effect.never).pipe(Effect.forkScoped)
        const socket = yield* NodeSocket.makeNet({
          host: "127.0.0.1",
          port: (server.address as NetAddress.InetAddress).port
        })

        const error = yield* Effect.gen(function*() {
          const { upgrade } = yield* socket.reader
          return yield* upgrade({
            cert,
            key: Redacted.make(key),
            rejectUnauthorized: true
          }).pipe(Effect.flip)
        }).pipe(Effect.scoped)

        assert.strictEqual(error.reason._tag, "SocketUpgradeError")
        if (error.reason._tag === "SocketUpgradeError") {
          assert.strictEqual((error.reason.cause as { code?: string }).code, "DEPTH_ZERO_SELF_SIGNED_CERT")
        }
      }))
  })

  describe("WebSocket", { concurrent: false }, () => {
    const url = `ws://localhost:1234`

    const makeServer = Effect.acquireRelease(
      Effect.sync(() => new WS(url)),
      (ws) =>
        Effect.sync(() => {
          ws.close()
          WS.clean()
        })
    )

    it.live("receives messages after handing a paused WebSocket to the reader", () =>
      Effect.gen(function*() {
        const serverScope = yield* Scope.make()
        const connections = new Set<NodeSocket.NodeWS.WebSocket>()
        yield* Effect.addFinalizer(() =>
          Effect.gen(function*() {
            for (const connection of connections) connection.terminate()
            yield* Scope.close(serverScope, Exit.void)
          })
        )
        const received = yield* Deferred.make<ReadonlyArray<Uint8Array | string>>()
        const server = yield* NodeSocketServer.makeWebSocket({ host: "127.0.0.1", port: 0 }).pipe(
          Scope.provide(serverScope)
        )
        assert.strictEqual(server.address._tag, "InetAddressV4")
        if (server.address._tag !== "InetAddressV4") return

        yield* server.run((socket) =>
          Effect.gen(function*() {
            const native = Option.getOrThrow(yield* Effect.serviceOption(Socket.WebSocket))
            if (native instanceof NodeSocket.NodeWS.WebSocket) connections.add(native)
            const { pull } = yield* socket.reader
            const writer = yield* socket.writer
            yield* writer.write("reader-ready")
            yield* Deferred.succeed(received, yield* pull)
          }).pipe(Effect.scoped)
        ).pipe(Effect.forkIn(serverScope))

        const client = new NodeSocket.NodeWS.WebSocket(`ws://127.0.0.1:${server.address.port}`)
        connections.add(client)
        const open = new Promise<void>((resolve, reject) => {
          client.once("open", resolve)
          client.once("error", reject)
        })
        const ready = new Promise<string>((resolve) => {
          client.once("message", (data) => resolve(data.toString()))
        })

        yield* Effect.promise(() => open).pipe(Effect.timeout("1 second"))
        assert.strictEqual(yield* Effect.promise(() => ready).pipe(Effect.timeout("1 second")), "reader-ready")
        client.send("after-ready")

        assert.deepStrictEqual(
          yield* Deferred.await(received).pipe(Effect.timeout("1 second")),
          ["after-ready"]
        )
      }))

    it.effect("passes headers to the opening handshake", () =>
      Effect.gen(function*() {
        const authorization = yield* Deferred.make<string | undefined>()
        const server = yield* NodeSocketServer.makeWebSocket({
          host: "127.0.0.1",
          port: 0,
          verifyClient: ({ req }: Parameters<NodeSocket.NodeWS.VerifyClientCallbackSync>[0]) => {
            Deferred.doneUnsafe(authorization, Effect.succeed(req.headers.authorization))
            return true
          }
        })
        assert.strictEqual(server.address._tag, "InetAddressV4")
        if (server.address._tag !== "InetAddressV4") return
        const port = server.address.port

        const makeWebSocket = yield* Socket.WebSocketConstructor
        const client = yield* Effect.acquireRelease(
          Effect.sync(() =>
            makeWebSocket(`ws://127.0.0.1:${port}`, {
              headers: { Authorization: "Bearer test" }
            })
          ),
          (client) => Effect.sync(() => client.close())
        )
        client.addEventListener("error", () => {})

        assert.strictEqual(yield* Deferred.await(authorization).pipe(Effect.timeout("1 second")), "Bearer test")
      }).pipe(Effect.provide(NodeSocket.layerWebSocketConstructorWS)))

    it.effect("fails TLS upgrade with SocketUpgradeError", () =>
      Effect.gen(function*() {
        yield* Effect.asVoid(makeServer)
        const socket = yield* Socket.makeWebSocket(Effect.succeed(url))
        const { upgrade } = yield* socket.reader
        const error = yield* upgrade({ cert, key: Redacted.make(key) }).pipe(Effect.flip)
        assert.strictEqual(error.reason._tag, "SocketUpgradeError")
      }).pipe(
        Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url))
      ))

    it.effect("messages", () =>
      Effect.gen(function*() {
        const server = yield* makeServer
        const socket = yield* Socket.makeWebSocket(Effect.succeed(url))
        const messages = yield* Queue.unbounded<Uint8Array>()
        const fiber = yield* Effect.gen(function*() {
          const pull = yield* Socket.readerBytes(socket)
          while (true) {
            yield* Queue.offerAll(messages, yield* pull)
          }
        }).pipe(Effect.scoped, Effect.forkChild)
        yield* Effect.gen(function*() {
          const writer = yield* socket.writer
          yield* writer.write(new TextEncoder().encode("Hello"))
          yield* writer.write(new TextEncoder().encode("World"))
        }).pipe(Effect.scoped)
        assert.deepStrictEqual(yield* Effect.promise(() => server.nextMessage), new TextEncoder().encode("Hello"))
        assert.deepStrictEqual(yield* Effect.promise(() => server.nextMessage), new TextEncoder().encode("World"))

        server.send("Right back at you!")
        let message = yield* Queue.take(messages)
        assert.deepStrictEqual(message, new TextEncoder().encode("Right back at you!"))

        server.send(new Blob(["A Blob message"]))
        message = yield* Queue.take(messages)
        assert.deepStrictEqual(message, new TextEncoder().encode("A Blob message"))

        server.close()
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          const failure = exit.cause.reasons[0]
          assert.strictEqual(failure._tag, "Fail")
          if (failure._tag === "Fail" && Socket.SocketError.is(failure.error)) {
            assert.strictEqual(failure.error.reason._tag, "SocketCloseError")
          } else {
            assert.fail("expected a SocketError")
          }
        }
      }).pipe(
        Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url))
      ))

    it.effect("clean closes are errors", () =>
      Effect.gen(function*() {
        const server = yield* makeServer
        const socket = yield* Socket.makeWebSocket(Effect.succeed(url))
        const fiber = yield* Effect.gen(function*() {
          const { pull } = yield* socket.reader
          while (true) {
            yield* pull
          }
        }).pipe(Effect.scoped, Effect.forkChild)

        yield* Effect.promise(() => server.connected)
        server.close({ code: 1000, reason: "done", wasClean: true })

        const exit = yield* Effect.exit(Fiber.join(fiber))
        assert.isTrue(exit._tag === "Failure")
        if (exit._tag === "Failure") {
          const failure = exit.cause.reasons[0]
          if (failure._tag === "Fail" && failure.error instanceof Socket.SocketError) {
            assert.strictEqual(failure.error.reason._tag, "SocketCloseError")
            if (failure.error.reason._tag === "SocketCloseError") {
              assert.strictEqual(failure.error.reason.code, 1000)
              assert.strictEqual(failure.error.reason.closeReason, "done")
            }
          } else {
            assert.fail("expected a SocketError")
          }
        }
      }).pipe(
        Effect.provideService(Socket.WebSocketConstructor, (url) => new globalThis.WebSocket(url))
      ))

    it.effect("reports send errors as SocketError", () =>
      Effect.gen(function*() {
        class ThrowingWebSocket extends EventTarget {
          readonly readyState = globalThis.WebSocket.OPEN

          close(): void {}

          send(): void {
            throw new Error("send failed")
          }
        }
        const webSocket = new ThrowingWebSocket()
        const socket = yield* Socket.makeWebSocket(Effect.succeed(url)).pipe(
          Effect.provideService(
            Socket.WebSocketConstructor,
            () => webSocket
          )
        )
        const exit = yield* Effect.scoped(Effect.gen(function*() {
          yield* Effect.asVoid(socket.reader)
          const writer = yield* socket.writer
          return yield* Effect.exit(writer.write(new Uint8Array([1])))
        }))
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          assert.strictEqual(exit.cause.reasons[0]?._tag, "Fail")
          const reason = exit.cause.reasons[0]
          if (reason?._tag === "Fail") {
            assert.isTrue(Socket.SocketError.is(reason.error))
            assert.strictEqual(reason.error.reason._tag, "SocketWriteError")
          }
        }
      }))
  })

  describe("TransformStream", () => {
    it.effect("works", () =>
      Effect.gen(function*() {
        const readable = Stream.make("A", "B", "C").pipe(
          Stream.tap(() => Effect.sleep(50)),
          Stream.toReadableStream()
        )
        const decoder = new TextDecoder()
        const chunks: Array<string> = []
        const writable = new WritableStream<Uint8Array>({
          write(chunk) {
            chunks.push(decoder.decode(chunk))
          }
        })

        const socket = yield* Socket.fromTransformStream(
          Effect.succeed({
            readable,
            writable
          })
        )
        yield* socket.writer.pipe(
          Effect.tap((writer) =>
            writer.write("Hello").pipe(
              Effect.andThen(writer.write("World"))
            )
          ),
          Effect.scoped,
          Effect.forkChild
        )
        const received: Array<string> = []
        yield* Effect.gen(function*() {
          const pull = yield* Socket.readerString(socket)
          while (true) {
            const chunk = yield* pull
            for (const data of chunk) {
              received.push(data)
            }
          }
        }).pipe(
          Effect.scoped,
          Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void)
        )

        assert.deepStrictEqual(chunks, ["Hello", "World"])
        assert.deepStrictEqual(received, ["A", "B", "C"])
      }))

    it.effect("reports writable stream rejection as SocketError", () =>
      Effect.gen(function*() {
        const socket = yield* Socket.fromTransformStream(Effect.succeed({
          readable: new ReadableStream<Uint8Array>({}),
          writable: new WritableStream<Uint8Array>({
            write: () => Promise.reject(new Error("write failed"))
          })
        }))
        const exit = yield* Effect.scoped(Effect.gen(function*() {
          yield* Effect.asVoid(socket.reader)
          const writer = yield* socket.writer
          return yield* Effect.exit(writer.write(new Uint8Array([1])))
        }))
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          assert.strictEqual(exit.cause.reasons[0]?._tag, "Fail")
          const reason = exit.cause.reasons[0]
          if (reason?._tag === "Fail") {
            assert.isTrue(Socket.SocketError.is(reason.error))
            assert.strictEqual(reason.error.reason._tag, "SocketWriteError")
          }
        }
      }))
  })
})
