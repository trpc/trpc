import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Queue, Ref, Schema, Scope, Sink, Stdio, Stream } from "effect"
import { Headers, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as NetAddress from "effect/net/NetAddress"
import { Rpc, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc"
import * as RpcMessage from "effect/rpc/RpcMessage"
import { Socket, SocketServer } from "effect/socket"

const producedWithoutReadingFramedBody = Effect.fnUntraced(function*(
  streamBufferSize?: number | "unbounded"
) {
  let produced = 0
  const Rpcs = RpcGroup.make(Rpc.make("events", {
    payload: Schema.Struct({}),
    success: Schema.Number,
    stream: true
  }))
  const Handlers = Rpcs.toLayerHandler(
    "events",
    () => Stream.fromEffectRepeat(Effect.sync(() => ++produced)).pipe(Stream.take(10_000))
  )
  const Server = RpcServer.layerHttp({
    group: Rpcs,
    path: "/rpc",
    protocol: "http",
    ...(streamBufferSize === undefined ? {} : { streamBufferSize })
  }).pipe(
    Layer.provide(Handlers),
    Layer.provide(RpcSerialization.layerNdjson)
  )
  const { dispose, handler } = HttpRouter.toWebHandler(Server)
  yield* Effect.addFinalizer(() => Effect.promise(dispose))

  const response = yield* Effect.promise(() =>
    handler(
      new Request("http://test/rpc", {
        method: "POST",
        body: `{"_tag":"Request","id":1,"tag":"events","payload":{},"headers":[]}\n`
      })
    )
  )
  yield* Effect.addFinalizer(() => response.body === null ? Effect.void : Effect.promise(() => response.body!.cancel()))
  for (let i = 0; i < 100; i++) {
    yield* Effect.yieldNow
  }

  return produced
})

describe("RpcServer", () => {
  it.effect("should drain the response when stdin ends during request startup", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const finishRequest = yield* Deferred.make<void>()
      const output: Array<string> = []
      const group = RpcGroup.make(Rpc.make("wait", { payload: Schema.Struct({}), success: Schema.String }))
      const server = yield* Layer.launch(
        RpcServer.layer(group).pipe(
          Layer.provide(group.toLayerHandler("wait", () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(finishRequest)),
              Effect.as("finished")
            ))),
          Layer.provide(RpcServer.layerProtocolStdio),
          Layer.provide(RpcSerialization.layerNdjson),
          Layer.provide(Stdio.layerTest({
            stdin: Stream.make(
              new TextEncoder().encode(
                `{"_tag":"Request","id":1,"tag":"wait","payload":{},"headers":[]}\n`
              )
            ).pipe(Stream.concat(Stream.fromEffect(Deferred.await(started)).pipe(Stream.drain))),
            stdout: () => Sink.forEach((data) => Effect.sync(() => output.push(String(data))))
          }))
        )
      ).pipe(Effect.forkScoped)
      yield* Deferred.await(started)
      yield* Deferred.succeed(finishRequest, undefined)
      yield* Fiber.await(server)
      assert.deepStrictEqual(output.join("").trim().split("\n").map((line) => JSON.parse(line)), [
        { _tag: "Exit", requestId: 1, exit: { _tag: "Success", value: "finished" } }
      ])
    }))

  it.effect("should shut down when stdin ends after the STDIO response is written", () =>
    Effect.gen(function*() {
      const responseWritten = yield* Deferred.make<void>()
      const closeStdin = yield* Deferred.make<void>()
      const output: Array<string> = []
      const group = RpcGroup.make(Rpc.make("hello", { payload: Schema.Struct({}), success: Schema.String }))
      const server = yield* Layer.launch(
        RpcServer.layer(group).pipe(
          Layer.provide(group.toLayerHandler("hello", () => Effect.succeed("world"))),
          Layer.provide(RpcServer.layerProtocolStdio),
          Layer.provide(RpcSerialization.layerNdjson),
          Layer.provide(Stdio.layerTest({
            stdin: Stream.make(
              new TextEncoder().encode(`{"_tag":"Request","id":1,"tag":"hello","payload":{},"headers":[]}\n`)
            ).pipe(Stream.concat(Stream.fromEffect(Deferred.await(closeStdin)).pipe(Stream.drain))),
            stdout: () =>
              Sink.forEach((data) =>
                Effect.sync(() => output.push(String(data))).pipe(
                  Effect.andThen(Deferred.succeed(responseWritten, undefined))
                )
              )
          }))
        )
      ).pipe(Effect.forkScoped)
      yield* Deferred.await(responseWritten)
      assert.deepStrictEqual(output.join("").trim().split("\n").map((line) => JSON.parse(line)), [
        { _tag: "Exit", requestId: 1, exit: { _tag: "Success", value: "world" } }
      ])
      yield* Deferred.succeed(closeStdin, undefined)
      yield* Fiber.await(server)
    }))

  it.effect("should wait for a blocked STDIO write before shutting down", () =>
    Effect.gen(function*() {
      const writeStarted = yield* Deferred.make<void>()
      const finishWrite = yield* Deferred.make<void>()
      const output: Array<string> = []
      const server = yield* Layer.launch(
        RpcServer.layer(RpcGroup.make()).pipe(
          Layer.provide(RpcServer.layerProtocolStdio),
          Layer.provide(RpcSerialization.layerNdjson),
          Layer.provide(Stdio.layerTest({
            stdin: Stream.make(new TextEncoder().encode(`{"_tag":"Ping"}\n`)),
            stdout: () =>
              Sink.forEach((data) =>
                Deferred.succeed(writeStarted, undefined).pipe(
                  Effect.andThen(Deferred.await(finishWrite)),
                  Effect.andThen(Effect.sync(() => output.push(String(data))))
                )
              )
          }))
        )
      ).pipe(Effect.forkScoped)
      yield* Deferred.await(writeStarted)
      yield* Effect.yieldNow
      assert.isUndefined(server.pollUnsafe())
      yield* Deferred.succeed(finishWrite, undefined)
      yield* Fiber.await(server)
      assert.deepStrictEqual(output.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)), [{
        _tag: "Pong"
      }])
    }))

  it.effect("should accept only cancellation of an active request when client input has ended", () =>
    Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const releaseOther = yield* Deferred.make<void>()
      const group = RpcGroup.make(Rpc.make("wait", {
        payload: { block: Schema.Boolean },
        success: Schema.String
      }))
      const messages = yield* Queue.unbounded<RpcMessage.FromServer<RpcGroup.Rpcs<typeof group>>>()
      const server = yield* RpcServer.makeNoSerialization(group, {
        onFromServer: (message) => Queue.offer(messages, message).pipe(Effect.asVoid)
      }).pipe(Effect.provide(group.toLayerHandler("wait", ({ block }) =>
        block
          ? Deferred.succeed(entered, void 0).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0))
          )
          : Deferred.await(releaseOther).pipe(Effect.as("kept")))))
      const request = {
        _tag: "Request" as const,
        id: RpcMessage.RequestId("same"),
        tag: "wait" as const,
        payload: { block: true },
        headers: Headers.empty
      }
      yield* server.write(1, request)
      yield* server.write(2, { ...request, payload: { block: false } })
      yield* Deferred.await(entered)
      yield* server.write(1, RpcMessage.constEof)
      yield* server.write(2, RpcMessage.constEof)
      for (
        const message of [
          { ...request, id: RpcMessage.RequestId("new") },
          { _tag: "Ack" as const, requestId: request.id },
          RpcMessage.constEof,
          { _tag: "Interrupt" as const, requestId: RpcMessage.RequestId("unknown"), interruptors: [] }
        ]
      ) {
        assert(Exit.isFailure(yield* Effect.exit(server.write(1, message))))
      }
      assert(Exit.isSuccess(
        yield* Effect.exit(server.write(1, {
          _tag: "Interrupt",
          requestId: request.id,
          interruptors: []
        }))
      ))
      yield* Deferred.await(interrupted)
      const cancelled = yield* Queue.take(messages)
      assert.strictEqual(cancelled._tag, "Exit")
      assert.strictEqual(cancelled.clientId, 1)
      if (cancelled._tag === "Exit") assert(Exit.isFailure(cancelled.exit))
      assert.deepStrictEqual(yield* Queue.take(messages), { _tag: "ClientEnd", clientId: 1 })
      yield* Deferred.succeed(releaseOther, void 0)
      assert.deepStrictEqual(yield* Queue.take(messages), {
        _tag: "Exit",
        clientId: 2,
        requestId: request.id,
        exit: Exit.succeed("kept")
      })
      assert.deepStrictEqual(yield* Queue.take(messages), { _tag: "ClientEnd", clientId: 2 })
    }))

  it.effect("should backpressure STDIO sends when the output buffer is full", () =>
    Effect.gen(function*() {
      const protocolReady = yield* Deferred.make<RpcServer.Protocol["Service"]>()
      const firstWriteStarted = yield* Deferred.make<void>()
      const releaseFirstWrite = yield* Deferred.make<void>()
      const overflowSendCompleted = yield* Deferred.make<void>()
      const writes = yield* Ref.make(0)
      const stdio = Stdio.layerTest({
        stdin: Stream.never,
        stdout: () =>
          Sink.forEach(() =>
            Ref.getAndUpdate(writes, (count) => count + 1).pipe(
              Effect.flatMap((index) =>
                index === 0
                  ? Deferred.succeed(firstWriteStarted, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseFirstWrite))
                  )
                  : Effect.void
              )
            )
          )
      })
      yield* Effect.gen(function*() {
        const protocol = yield* RpcServer.makeProtocolStdio
        yield* Deferred.succeed(protocolReady, protocol)
        return yield* protocol.run(() => Effect.void)
      }).pipe(
        Effect.provide(stdio),
        Effect.provide(RpcSerialization.layerJsonRpc()),
        Effect.forkScoped
      )
      const protocol = yield* Deferred.await(protocolReady)

      const first = yield* protocol.send(0, { _tag: "Pong" }).pipe(Effect.forkScoped)
      yield* Deferred.await(firstWriteStarted)
      for (let i = 0; i < 8; i++) {
        yield* protocol.send(0, { _tag: "Pong" })
      }
      const overflow = yield* protocol.send(0, { _tag: "Pong" }).pipe(
        Effect.andThen(Deferred.succeed(overflowSendCompleted, undefined)),
        Effect.forkScoped
      )
      yield* Effect.yieldNow
      assert.strictEqual(yield* Ref.get(writes), 1)
      assert.isFalse(yield* Deferred.isDone(overflowSendCompleted))

      yield* Deferred.succeed(releaseFirstWrite, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(overflow)
      assert.strictEqual(yield* Ref.get(writes), 10)
    }))

  it.effect("should continue sending to other clients when a backpressured HTTP client disconnects", () =>
    Effect.gen(function*() {
      const { httpEffect, protocol } = yield* RpcServer.makeProtocolWithHttpEffect({ streamBufferSize: 1 }).pipe(
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const connected = yield* Queue.unbounded<number>()
      const interrupted = yield* Queue.unbounded<RpcMessage.FromClientEncoded>()
      yield* protocol.run((clientId, message) => {
        if (message._tag === "Request") {
          return Queue.offer(connected, clientId).pipe(
            Effect.andThen(protocol.send(clientId, { _tag: "Pong" }))
          )
        }
        return message._tag === "Interrupt" ? Queue.offer(interrupted, message) : Effect.void
      }).pipe(Effect.forkScoped)

      const scope = yield* Scope.Scope
      const firstScope = yield* Scope.fork(scope)
      const request = HttpServerRequest.fromWeb(
        new Request("http://test/rpc", {
          method: "POST",
          body: `{"_tag":"Request","id":1,"tag":"events","payload":{},"headers":[]}\n`
        })
      )
      yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(Scope.Scope, firstScope)
      )
      const firstId = yield* Queue.take(connected)
      const response = yield* httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(
            new Request(
              "http://test/rpc",
              { method: "POST", body: `{"_tag":"Request","id":2,"tag":"events","payload":{},"headers":[]}\n` }
            )
          )
        )
      )
      const secondId = yield* Queue.take(connected)
      yield* protocol.send(firstId, { _tag: "Pong" })
      const delivered = yield* Deferred.make<void>()
      const sender = yield* protocol.send(firstId, { _tag: "Pong" }).pipe(
        Effect.andThen(protocol.send(secondId, { _tag: "Pong" })),
        Effect.andThen(Deferred.succeed(delivered, undefined)),
        Effect.forkScoped
      )
      yield* Effect.yieldNow
      assert.isFalse(yield* Deferred.isDone(delivered))

      yield* Scope.close(firstScope, Exit.void)
      yield* Effect.yieldNow
      assert.isTrue(yield* Deferred.isDone(delivered))
      yield* Fiber.join(sender)
      assert.deepStrictEqual(yield* Queue.take(interrupted), {
        _tag: "Interrupt",
        requestId: RpcMessage.RequestId(1)
      })
      yield* protocol.end(secondId)
      const body = yield* Effect.promise(() => HttpServerResponse.toWeb(response).text())
      assert.deepStrictEqual(body.trim().split("\n").map((line) => JSON.parse(line)), [
        { _tag: "Pong" },
        { _tag: "Pong" }
      ])
    }))

  it.effect("applies backpressure to framed HTTP responses by default", () =>
    Effect.gen(function*() {
      const produced = yield* producedWithoutReadingFramedBody()

      assert.isAbove(produced, 0)
      assert.isBelow(produced, 10_000)
    }))

  it.effect("uses the configured framed HTTP response buffer size", () =>
    Effect.gen(function*() {
      const produced = yield* producedWithoutReadingFramedBody(1)

      assert.isAbove(produced, 0)
      assert.isBelow(produced, 16)
    }))

  it.effect("allows unbounded framed HTTP response buffering", () =>
    Effect.gen(function*() {
      const produced = yield* producedWithoutReadingFramedBody("unbounded")

      assert.strictEqual(produced, 10_000)
    }))

  it.effect("keeps non-framed HTTP responses unbounded", () =>
    Effect.gen(function*() {
      let produced = 0
      const Rpcs = RpcGroup.make(Rpc.make("events", {
        payload: Schema.Struct({}),
        success: Schema.Number,
        stream: true
      }))
      const Handlers = Rpcs.toLayerHandler(
        "events",
        () => Stream.fromEffectRepeat(Effect.sync(() => ++produced)).pipe(Stream.take(100))
      )
      const Server = RpcServer.layerHttp({
        group: Rpcs,
        path: "/rpc",
        protocol: "http",
        streamBufferSize: 1
      }).pipe(
        Layer.provide(Handlers),
        Layer.provide(RpcSerialization.layerJson)
      )
      const { dispose, handler } = HttpRouter.toWebHandler(Server)
      yield* Effect.addFinalizer(() => Effect.promise(dispose))

      yield* Effect.promise(() =>
        handler(
          new Request("http://test/rpc", {
            method: "POST",
            body: `{"_tag":"Request","id":1,"tag":"events","payload":{},"headers":[]}`
          })
        )
      )

      assert.strictEqual(produced, 100)
    }))

  it.effect("closes a socket when the serialization buffer limit is exceeded", () =>
    Effect.gen(function*() {
      const handledChunks: Array<string> = []
      const writes: Array<Uint8Array | string | Socket.CloseEvent> = []
      const completed = yield* Deferred.make<void>()
      let closed = false

      const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
        Effect.sync(() => {
          writes.push(chunk)
          if (Socket.isCloseEvent(chunk)) {
            closed = true
          }
        })
      const socket = Socket.make({
        reader: Effect.sync(() => {
          const chunks = ["12", "34", "5", "{\"_tag\":\"Ping\"}\n"]
          let index = 0
          return {
            pull: Effect.suspend(() => {
              if (closed || index >= chunks.length) {
                return Deferred.succeed(completed, void 0).pipe(
                  Effect.andThen(Effect.fail(
                    new Socket.SocketError({
                      reason: new Socket.SocketCloseError({ code: 1000 })
                    })
                  ))
                )
              }
              const chunk = chunks[index++]
              handledChunks.push(chunk)
              return Effect.succeed([chunk] as const)
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
      const socketServer = SocketServer.SocketServer.of({
        address: NetAddress.inetAddressFromStringUnsafe("127.0.0.1:0"),
        run: (handler) => handler(socket).pipe(Effect.orDie, Effect.andThen(Effect.never))
      })

      const protocol = yield* RpcServer.makeProtocolSocketServer.pipe(
        Effect.provide(Layer.succeed(SocketServer.SocketServer, socketServer)),
        Effect.provide(Layer.succeed(
          RpcSerialization.RpcSerialization,
          RpcSerialization.makeNdjson({ maxBufferSize: 4 })
        ))
      )
      yield* Effect.forkScoped(protocol.run(() => Effect.void))
      yield* Deferred.await(completed)

      assert.deepStrictEqual(handledChunks, ["12", "34", "5"])
      assert.strictEqual(writes.length, 1)
      const closeEvent = writes[0]
      assert(Socket.isCloseEvent(closeEvent))
      assert.strictEqual(closeEvent.code, 1009)
    }))
})
