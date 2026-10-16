import * as DenoSocket from "@effect/platform-deno/DenoSocket"
import * as DenoSocketServer from "@effect/platform-deno/DenoSocketServer"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Redacted, Scope } from "effect"
import * as NetAddress from "effect/net/NetAddress"
import type * as Socket from "effect/socket/Socket"

const ca = Deno.readTextFileSync(new URL("./fixtures/tls/ca.pem", import.meta.url))
const cert = Deno.readTextFileSync(new URL("./fixtures/tls/cert.pem", import.meta.url))
const key = Deno.readTextFileSync(new URL("./fixtures/tls/key.pem", import.meta.url))

const makeTempDir = Effect.acquireRelease(
  Effect.promise(() => Deno.makeTempDir()),
  (path) => Effect.promise(() => Deno.remove(path, { recursive: true }))
)

const echo = (socket: Socket.Socket, upgradeOptions?: Socket.TlsUpgradeOptions) =>
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

const sendHelloDeno = (socket: Socket.Socket, upgradeOptions?: Socket.TlsUpgradeOptions) =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const { pull, upgrade } = yield* socket.reader
    if (upgradeOptions !== undefined) {
      yield* upgrade(upgradeOptions)
    }
    yield* writer.writeAll(["Hello", "Deno"])
    const decoder = new TextDecoder()
    let output = ""
    while (output.length < 9) {
      for (const chunk of yield* pull) {
        output += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      }
    }
    return output
  }).pipe(Effect.scoped)

describe("DenoSocketServer", () => {
  it.effect("echoes over TCP and reports its address", () =>
    Effect.gen(function*() {
      const server = yield* DenoSocketServer.make({ host: "127.0.0.1", port: 0 })
      const address = server.address
      assert.strictEqual(address._tag, "InetAddressV4")
      if (address._tag !== "InetAddressV4") return
      assert.strictEqual(NetAddress.formatIp(address.address), "127.0.0.1")
      assert.notStrictEqual(address.port, 0)
      yield* server.run(echo).pipe(Effect.forkScoped)

      const socket = yield* DenoSocket.makeTcp({
        hostname: NetAddress.formatIp(address.address),
        port: address.port
      })
      const output = yield* sendHelloDeno(socket)

      assert.strictEqual(output, "HelloDeno")
    }))

  it.effect("echoes over Unix sockets and reports its address", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDir
      const path = `${directory}/echo.sock`
      const server = yield* DenoSocketServer.make({ path })
      assert.strictEqual(server.address._tag, "UnixPathAddress")
      assert.strictEqual(server.address._tag === "UnixPathAddress" ? server.address.path : undefined, path)
      yield* server.run(echo).pipe(Effect.forkScoped)

      const socket = yield* DenoSocket.makeTcp({ transport: "unix", path })
      const output = yield* sendHelloDeno(socket)

      assert.strictEqual(output, "HelloDeno")
    }))

  it.effect("closes with a pending pre-run connection", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const server = yield* DenoSocketServer.make({ host: "127.0.0.1", port: 0 }).pipe(Scope.provide(scope))
      const address = server.address
      assert.strictEqual(address._tag, "InetAddressV4")
      if (address._tag !== "InetAddressV4") return
      const conn = yield* Effect.acquireRelease(
        Effect.promise(() => Deno.connect({ hostname: NetAddress.formatIp(address.address), port: address.port })),
        (conn) => Effect.sync(() => conn.close())
      )
      void conn

      yield* Scope.close(scope, Exit.void).pipe(Effect.timeout("1 second"))
    }))

  it.effect("upgrades a plain server connection to TLS", () =>
    Effect.gen(function*() {
      const server = yield* DenoSocketServer.make({ host: "127.0.0.1", port: 0 })
      const address = server.address
      assert.strictEqual(address._tag, "InetAddressV4")
      if (address._tag !== "InetAddressV4") return
      yield* server.run((socket) => echo(socket, { cert, key: Redacted.make(key) })).pipe(Effect.forkScoped)

      const socket = yield* DenoSocket.makeTcp({
        hostname: NetAddress.formatIp(address.address),
        port: address.port
      })
      const output = yield* sendHelloDeno(socket, {
        ca: [ca]
      })

      assert.strictEqual(output, "HelloDeno")
    }))
})
