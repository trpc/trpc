import * as BunClusterHttp from "@effect/platform-bun/BunClusterHttp"
import { assert, describe, it } from "@effect/vitest"
import * as ShardingConfig from "effect/cluster/ShardingConfig"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as NetAddress from "effect/net/NetAddress"

describe("BunClusterHttp", () => {
  for (
    const [name, values] of [
      ["listen address overrides the runner address", {
        host: "::1",
        port: "0",
        listenHost: "127.0.0.1",
        listenPort: "0"
      }],
      ["runner address is used when the listen address is omitted", { host: "127.0.0.1", port: "0" }]
    ] as const
  ) {
    it.effect(name, () =>
      Effect.gen(function*() {
        const config = yield* ShardingConfig.config.parse(ConfigProvider.fromUnknown(values))
        yield* Effect.gen(function*() {
          const server = yield* HttpServer.HttpServer
          if (server.address._tag !== "InetAddressV4") {
            return assert.fail(`expected InetAddressV4 at 127.0.0.1, got ${server.address}`)
          }
          assert.strictEqual(NetAddress.formatIp(server.address.address), "127.0.0.1")
          assert.isAbove(server.address.port, 0)

          yield* server.serve(Effect.succeed(HttpServerResponse.text("cluster loopback")))
          const client = yield* HttpServer.makeTestClient.pipe(Effect.provide(FetchHttpClient.layer))
          const response = yield* client.get("/")
          assert.strictEqual(response.status, 200)
          assert.strictEqual(yield* response.text, "cluster loopback")
        }).pipe(
          Effect.provide(BunClusterHttp.layerHttpServer),
          Effect.provide(ShardingConfig.layer(config))
        )
      }))
  }
})
