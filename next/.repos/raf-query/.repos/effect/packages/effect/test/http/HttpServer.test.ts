import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpServer from "effect/http/HttpServer"
import * as NetAddress from "effect/net/NetAddress"

describe("HttpServer", () => {
  it("accepts a canonical socket address", () => {
    const address = NetAddress.inetAddressUnsafe(NetAddress.ipv4Loopback, 8080)
    const server = HttpServer.make({
      address,
      serve: () => Effect.void
    })

    assert.strictEqual(server.address, address)
  })

  it.effect("passes formatted server addresses to the callback", () =>
    Effect.gen(function*() {
      for (
        const [input, expected] of [
          ["127.0.0.1:3000", "http://127.0.0.1:3000"],
          ["127.0.0.1:80", "http://127.0.0.1"],
          ["[::]:3000", "http://[::]:3000"],
          ["[::1]:3000", "http://[::1]:3000"],
          ["[fe80::1%0]:3000", "http://[fe80::1]:3000"]
        ]
      ) {
        const server = HttpServer.make({
          address: NetAddress.inetAddressFromStringUnsafe(input),
          serve: () => Effect.void
        })
        const formatted = yield* HttpServer.addressFormattedWith(Effect.succeed).pipe(
          Effect.provideService(HttpServer.HttpServer, server)
        )
        assert.strictEqual(formatted, expected)
        assert.doesNotThrow(() => new URL(formatted))
      }
      for (
        const [path, expected] of [
          ["server.sock", "unix://server.sock"],
          ["/tmp/server.sock", "unix:///tmp/server.sock"],
          ["./run/../socket?#", "unix://./run/../socket?#"]
        ]
      ) {
        const server = HttpServer.make({ address: NetAddress.unixPathAddress(path), serve: () => Effect.void })
        const formatted = yield* HttpServer.addressFormattedWith(Effect.succeed).pipe(
          Effect.provideService(HttpServer.HttpServer, server)
        )
        assert.strictEqual(formatted, expected)
      }
    }))

  it.effect("rejects scoped IPv6 test server addresses before dropping their scope", () =>
    Effect.gen(function*() {
      for (const input of ["[fe80::1%2]:3000", "[::%2]:3000"]) {
        const address = NetAddress.inetAddressFromStringUnsafe(input)
        const server = HttpServer.make({ address, serve: () => Effect.void })
        const client = HttpClient.make(() => Effect.die("unexpected request"))
        const exit = yield* HttpServer.makeTestClient.pipe(
          Effect.provideService(HttpServer.HttpServer, server),
          Effect.provideService(HttpClient.HttpClient, client),
          Effect.exit
        )
        if (Exit.isSuccess(exit)) assert.fail("expected Failure")
        const error = Cause.squash(exit.cause)
        assert.instanceOf(error, NetAddress.NetAddressError)
        assert.strictEqual((error as NetAddress.NetAddressError).input, address)
      }
    }))

  it.effect("uses IPv4 loopback for unspecified listeners and preserves explicit hosts", () =>
    Effect.gen(function*() {
      for (
        const [input, origin] of [
          ["0.0.0.0:3000", "http://127.0.0.1:3000"],
          ["[::]:3000", "http://127.0.0.1:3000"],
          ["127.0.0.1:3000", "http://127.0.0.1:3000"],
          ["[::1]:3000", "http://[::1]:3000"],
          ["[2001:db8::1]:3000", "http://[2001:db8::1]:3000"]
        ]
      ) {
        const server = HttpServer.make({
          address: NetAddress.inetAddressFromStringUnsafe(input),
          serve: () => Effect.void
        })
        const client = HttpClient.make((request, url) => {
          assert.strictEqual(url.origin, origin)
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response()))
        })
        const testClient = yield* HttpServer.makeTestClient.pipe(
          Effect.provideService(HttpServer.HttpServer, server),
          Effect.provideService(HttpClient.HttpClient, client)
        )
        yield* testClient.get("/")
      }
    }))
})
