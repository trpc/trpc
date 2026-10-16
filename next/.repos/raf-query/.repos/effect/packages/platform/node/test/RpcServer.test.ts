import { NodeHttpServer, NodeSocket, NodeSocketServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Ref, Schedule, Schema, Stream } from "effect"
import { Entity, EntityProxy, EntityProxyServer, Sharding } from "effect/cluster"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/http"
import type * as NetAddress from "effect/net/NetAddress"
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer, RpcTest } from "effect/rpc"
import { SocketServer } from "effect/socket"
import { e2eSuite, UsersClient } from "./fixtures/rpc-e2e.ts"
import { RpcLayer, User } from "./fixtures/rpc-schemas.ts"

describe("RpcServer", () => {
  // http ndjson
  const HttpProtocol = RpcServer.layerProtocolHttp({ path: "/rpc" })
  const HttpNdjsonServer = HttpRouter.serve(
    RpcLayer.pipe(Layer.provideMerge(HttpProtocol)),
    { disableListenLog: true, disableLogger: true }
  )
  const HttpNdjsonClient = UsersClient.layer.pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: "",
        transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl("/rpc"))
      })
    )
  )
  const CustomDefectLayer = HttpNdjsonClient.pipe(
    Layer.provideMerge(HttpNdjsonServer),
    Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
  )
  e2eSuite(
    "e2e http ndjson",
    HttpNdjsonClient.pipe(
      Layer.provideMerge(HttpNdjsonServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
    )
  )
  e2eSuite(
    "e2e http SchemaBinary",
    HttpNdjsonClient.pipe(
      Layer.provideMerge(HttpNdjsonServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerSchemaBinary()])
    )
  )
  e2eSuite(
    "e2e http jsonrpc",
    HttpNdjsonClient.pipe(
      Layer.provideMerge(HttpNdjsonServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdJsonRpc()])
    )
  )

  // websocket
  const WsProtocol = RpcServer.layerProtocolWebsocket({ path: "/rpc" })
  const HttpWsServer = HttpRouter.serve(
    RpcLayer.pipe(Layer.provideMerge(WsProtocol)),
    { disableListenLog: true, disableLogger: true }
  )
  const HttpWsClient = UsersClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(
      Effect.gen(function*() {
        const server = yield* HttpServer.HttpServer
        const address = server.address as NetAddress.InetAddress
        return NodeSocket.layerWebSocket(`http://127.0.0.1:${address.port}/rpc`)
      }).pipe(Layer.unwrap)
    )
  )
  e2eSuite(
    "e2e ws ndjson",
    HttpWsClient.pipe(
      Layer.provideMerge(HttpWsServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
    )
  )
  e2eSuite(
    "e2e ws json",
    HttpWsClient.pipe(
      Layer.provideMerge(HttpWsServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerJson])
    )
  )
  e2eSuite(
    "e2e ws SchemaBinary",
    HttpWsClient.pipe(
      Layer.provideMerge(HttpWsServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerSchemaBinary()])
    )
  )
  e2eSuite(
    "e2e ws jsonrpc",
    HttpWsClient.pipe(
      Layer.provideMerge(HttpWsServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerJsonRpc()])
    )
  )

  // tcp
  const TcpServer = RpcLayer.pipe(
    Layer.provideMerge(RpcServer.layerProtocolSocketServer),
    Layer.provideMerge(NodeSocketServer.layer({ port: 0 }))
  )
  const TcpClient = UsersClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(
      Effect.gen(function*() {
        const server = yield* SocketServer.SocketServer
        const address = server.address as NetAddress.InetAddress
        return NodeSocket.layerNet({ port: address.port })
      }).pipe(Layer.unwrap)
    )
  )
  e2eSuite(
    "e2e tcp ndjson",
    TcpClient.pipe(
      Layer.provideMerge(TcpServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdjson])
    )
  )
  e2eSuite(
    "e2e tcp SchemaBinary",
    TcpClient.pipe(
      Layer.provideMerge(TcpServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerSchemaBinary()])
    )
  )
  e2eSuite(
    "e2e tcp jsonrpc",
    TcpClient.pipe(
      Layer.provideMerge(TcpServer),
      Layer.provide([NodeHttpServer.layerTest, RpcSerialization.layerNdJsonRpc()])
    )
  )

  // worker
  // const WorkerClient = UsersClient.layer.pipe(
  //   Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
  //   Layer.provide(
  //     NodeWorker.layerPlatform(() =>
  //       CP.fork(new URL("./fixtures/rpc-worker.ts", import.meta.url), {
  //         execPath: "node"
  //       })
  //     )
  //   ),
  //   Layer.merge(Layer.succeed(RpcServer.Protocol, {
  //     supportsAck: true
  //   } as any))
  // )
  // e2eSuite("e2e worker", WorkerClient)

  describe("RpcTest", () => {
    it.effect("works", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const user = yield* client.GetUser({ id: "1" })
        assert.deepStrictEqual(user, new User({ id: "1", name: "Logged in user" }))
      }).pipe(Effect.provide(UsersClient.layerTest)))
  })

  describe("custom defect schema", () => {
    it.effect("preserves full defect with custom schema", () =>
      Effect.gen(function*() {
        const client = yield* UsersClient
        const cause = yield* client.ProduceDefectCustom().pipe(
          Effect.sandbox,
          Effect.flip
        )
        const defect = Cause.squash(cause)
        assert.instanceOf(defect, Error)
        assert.strictEqual(defect.name, "CustomDefect")
        assert.strictEqual(defect.message, "detailed error")
        assert.strictEqual(defect.stack, "Error: detailed error\n  at handler.ts:1")
      }).pipe(Effect.provide(CustomDefectLayer)))
  })

  describe("entity proxy", () => {
    it.effect("provides handler context for generated rpc handlers", () =>
      Effect.gen(function*() {
        const TestEntity = Entity.make("TestEntity", [Rpc.make("NoPayload")])
        const TestEntityRpcs = EntityProxy.toRpcGroup(TestEntity)
        const called = yield* Deferred.make<void>()
        const testClient = (entityId: string) => ({
          NoPayload: (payload: void, options?: { readonly discard?: boolean }) =>
            Effect.gen(function*() {
              assert.strictEqual(entityId, "id")
              assert.strictEqual(payload, undefined)
              assert.strictEqual(options?.discard, true)
              yield* Deferred.succeed(called, undefined)
            })
        })
        const sharding = Sharding.Sharding.of({
          ...({} as Sharding.Sharding["Service"]),
          isShutdown: Effect.succeed(false),
          makeClient: () => Effect.succeed(testClient) as never,
          pollStorage: Effect.void
        })

        const client = yield* RpcTest.makeClient(TestEntityRpcs).pipe(
          Effect.provide(EntityProxyServer.layerRpcHandlers(TestEntity)),
          Effect.provideService(Sharding.Sharding, sharding)
        )

        yield* client["TestEntity.NoPayloadDiscard"]({
          entityId: "id",
          payload: undefined
        })
        yield* Deferred.await(called)
      }))
  })

  // Asserts a failing sibling call does not affect an in-flight Ticker stream on the same connection
  const Ticker = Rpc.make("Ticker", {
    success: Schema.Number,
    stream: true
  })

  const IsolationClient = RpcClient.layerProtocolSocket().pipe(
    Layer.provide(
      Effect.gen(function*() {
        const server = yield* SocketServer.SocketServer
        const address = server.address as NetAddress.InetAddress
        return NodeSocket.layerNet({ port: address.port })
      }).pipe(Layer.unwrap)
    ),
    Layer.provide(RpcSerialization.layerNdjson)
  )

  const assertTickerSurvives = <E, R>(
    setup: Effect.Effect<
      {
        readonly ticker: Stream.Stream<number, E>
        readonly failingCall: Effect.Effect<void>
      },
      never,
      R
    >,
    label: string
  ) =>
    Effect.gen(function*() {
      const { failingCall, ticker } = yield* setup

      const received = yield* Ref.make<Array<number>>([])

      const tickerFiber = yield* ticker.pipe(
        Stream.runForEach((value) => Ref.update(received, (xs) => [...xs, value])),
        Effect.forkChild
      )

      yield* Effect.retry(
        Effect.flatMap(
          Ref.get(received),
          (xs) => xs.length >= 2 ? Effect.void : Effect.fail("not enough ticks yet")
        ),
        { schedule: Schedule.spaced("50 millis"), times: 200 }
      )

      const ticksBefore = (yield* Ref.get(received)).length
      assert.isAtLeast(ticksBefore, 2)

      yield* failingCall

      yield* Effect.sleep("300 millis")

      const ticksAfter = (yield* Ref.get(received)).length
      const tickerStatus = tickerFiber.pollUnsafe()

      yield* Fiber.interrupt(tickerFiber)

      assert.isUndefined(tickerStatus, `Ticker stream must still be running after ${label}`)
      assert.isAbove(ticksAfter, ticksBefore, `Ticker stream must keep emitting after ${label}`)
    })

  describe("unknown-tag isolation", () => {
    const Ghost = Rpc.make("Ghost", {
      payload: { value: Schema.String },
      success: Schema.String
    })

    const serverGroup = RpcGroup.make(Ticker)
    const clientGroup = RpcGroup.make(Ticker, Ghost)

    const TickerHandlers = serverGroup.toLayer({
      Ticker: () => Stream.fromSchedule(Schedule.spaced("60 millis"))
    })

    const IsolationServer = RpcServer.layer(serverGroup).pipe(
      Layer.provide(TickerHandlers),
      Layer.provideMerge(RpcServer.layerProtocolSocketServer),
      Layer.provideMerge(NodeSocketServer.layer({ port: 0 })),
      Layer.provide(RpcSerialization.layerNdjson)
    )

    it.live(
      "an unknown request tag fails only its own request, not other in-flight streams on the same connection",
      () =>
        assertTickerSurvives(
          Effect.map(RpcClient.make(clientGroup), (client) => ({
            ticker: client.Ticker(),
            failingCall: Effect.gen(function*() {
              const ghostExit = yield* client.Ghost({ value: "boo" }).pipe(Effect.exit)
              assert.isTrue(Exit.isFailure(ghostExit), "Ghost call should fail with the routing miss")
            })
          })),
          "the unknown-tag failure"
        ).pipe(Effect.provide(IsolationClient.pipe(Layer.provideMerge(IsolationServer)))),
      { timeout: 30_000 }
    )
  })

  describe("fatal-defect isolation", () => {
    const Boom = Rpc.make("Boom", {
      success: Schema.String
    })

    const group = RpcGroup.make(Ticker, Boom)

    const Handlers = group.toLayer({
      Ticker: () => Stream.fromSchedule(Schedule.spaced("60 millis")),
      Boom: () => Effect.die("boom")
    })

    const DefectServer = RpcServer.layer(group, { disableFatalDefects: true }).pipe(
      Layer.provide(Handlers),
      Layer.provideMerge(RpcServer.layerProtocolSocketServer),
      Layer.provideMerge(NodeSocketServer.layer({ port: 0 })),
      Layer.provide(RpcSerialization.layerNdjson)
    )

    it.live(
      "with disableFatalDefects a handler defect fails only its own request, not other in-flight streams",
      () =>
        assertTickerSurvives(
          Effect.map(RpcClient.make(group), (client) => ({
            ticker: client.Ticker(),
            failingCall: Effect.gen(function*() {
              const boomExit = yield* client.Boom().pipe(Effect.exit)
              if (!Exit.isFailure(boomExit)) {
                return assert.fail("Boom call must fail with the handler defect")
              }
              assert.include(
                String(Cause.squash(boomExit.cause)),
                "boom",
                "the caller must receive the handler defect"
              )
            })
          })),
          "the handler defect"
        ).pipe(Effect.provide(IsolationClient.pipe(Layer.provideMerge(DefectServer)))),
      { timeout: 30_000 }
    )
  })
})
