import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Context,
  Deferred,
  Effect,
  ErrorReporter,
  Exit,
  Fiber,
  Layer,
  Queue,
  Ref,
  RequestResolver,
  Schema,
  SchemaTransformation,
  Scope,
  Sink,
  Stdio,
  Stream,
  Tracer
} from "effect"
import { Headers, HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as NetAddress from "effect/net/NetAddress"
import * as EffectRequest from "effect/Request"
import { Rpc, RpcGroup, RpcMiddleware, RpcSchema, RpcSerialization, RpcServer } from "effect/rpc"
import * as RpcMessage from "effect/rpc/RpcMessage"
import { Socket, SocketServer } from "effect/socket"

class GetUser extends EffectRequest.Class<{ id: number }, string> {}

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
  for (
    const [name, serialization] of [
      ["ndjson", RpcSerialization.layerNdjson],
      ["json", RpcSerialization.layerJson]
    ] as const
  ) {
    it.live(`finalizes an aborted ${name} HTTP RPC before output`, () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const finalized = yield* Deferred.make<Exit.Exit<unknown, unknown>>()
        const group = RpcGroup.make(
          Rpc.make("events", { payload: Schema.Struct({}), success: Schema.Number, stream: true })
        )
        const httpEffect = yield* RpcServer.toHttpEffect(group).pipe(
          Effect.provide(Layer.mergeAll(
            group.toLayer({
              events: () =>
                Stream.fromEffect(Effect.gen(function*() {
                  yield* Effect.addFinalizer((exit) => Deferred.succeed(finalized, exit))
                  yield* Deferred.succeed(started, undefined)
                  return yield* Effect.never
                }))
            }),
            serialization
          ))
        )
        const handler = HttpEffect.toWebHandler(httpEffect)
        const controller = new AbortController()
        yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()))
        const request = yield* Effect.promise(() =>
          handler(
            new Request("http://test/rpc", {
              method: "POST",
              body: `{"_tag":"Request","id":1,"tag":"events","payload":{},"headers":[]}\n`,
              signal: controller.signal
            })
          )
        ).pipe(Effect.forkScoped)
        yield* Deferred.await(started).pipe(Effect.timeout("2 seconds"))
        controller.abort()
        const exit = yield* Deferred.await(finalized).pipe(Effect.timeout("2 seconds"))
        assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
        yield* Fiber.join(request).pipe(Effect.timeout("2 seconds"))
      }))
  }

  for (
    const [name, serialization] of [
      ["ndjson", RpcSerialization.layerNdjson],
      ["ndJsonRpc", RpcSerialization.layerNdJsonRpc()],
      ["schemaBinary", RpcSerialization.layerSchemaBinary()]
    ] as const
  ) {
    it.effect(`returns HTTP 200 with an empty body for an empty ${name} POST`, () =>
      Effect.gen(function*() {
        const group = RpcGroup.make(Rpc.make("ping", { success: Schema.String }))
        const httpEffect = yield* RpcServer.toHttpEffect(group).pipe(
          Effect.provide(Layer.mergeAll(
            group.toLayer({ ping: () => Effect.succeed("pong") }),
            serialization
          ))
        )
        const handler = HttpEffect.toWebHandler(httpEffect)
        const response = yield* Effect.promise(() =>
          handler(new Request("http://test/rpc", { method: "POST", body: "" }))
        )
        const body = yield* Effect.promise(() => response.text())

        assert.strictEqual(response.status, 200)
        assert.strictEqual(body, "")
      }))
  }

  it.effect("reports success encode failures with the rpc tag", () => {
    const reports: Array<string> = []
    return Effect.gen(function*() {
      const group = RpcGroup.make(Rpc.make("getUserAge", { payload: Schema.Struct({}), success: Schema.Number }))
      const handler = HttpEffect.toWebHandler(
        yield* RpcServer.toHttpEffect(group).pipe(
          Effect.provide(Layer.mergeAll(
            group.toLayer({ getUserAge: () => Effect.succeed("not a number" as unknown as number) }),
            RpcSerialization.layerNdjson
          ))
        )
      )
      const body = yield* Effect.promise(() =>
        handler(
          new Request("http://test/rpc", {
            method: "POST",
            body: `{"_tag":"Request","id":1,"tag":"getUserAge","payload":{},"headers":[]}\n`
          })
        ).then((response) => response.text())
      )

      const message = `Failed to encode response for RPC "getUserAge": Expected number\n  at ["value"]`
      const response: RpcMessage.ResponseExitEncoded = JSON.parse(body)
      assert.deepStrictEqual(response.exit, { _tag: "Failure", cause: [{ _tag: "Die", defect: message }] })
      assert.deepStrictEqual(reports, [message])
    }).pipe(Effect.provide(ErrorReporter.layer([ErrorReporter.make(({ error }) => reports.push(error.message))])))
  })

  it.effect("decodes payloads with the ParseOptions annotation", () =>
    Effect.gen(function*() {
      const batches: Array<ReadonlyArray<number>> = []
      const resolver = RequestResolver.make<GetUser>((entries) =>
        Effect.sync(() => {
          batches.push(entries.map((entry) => entry.request.id))
          for (const entry of entries) entry.completeUnsafe(Exit.succeed(`user-${entry.request.id}`))
        })
      )
      const User = Schema.Number.pipe(Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transformEffect({
          decode: (id) => Effect.request(new GetUser({ id }), resolver),
          encode: (name) => Effect.succeed(Number(name.slice("user-".length)))
        })
      ))
      const group = RpcGroup.make(
        Rpc.make("getUsers", {
          payload: { users: Schema.Array(User) },
          success: Schema.Array(Schema.String)
        }).annotate(Rpc.ParseOptions, { concurrency: "unbounded" })
      )
      const handler = HttpEffect.toWebHandler(
        yield* RpcServer.toHttpEffect(group).pipe(
          Effect.provide(Layer.mergeAll(
            group.toLayer({ getUsers: ({ users }) => Effect.succeed(users) }),
            RpcSerialization.layerNdjson
          ))
        )
      )
      const body = yield* Effect.promise(() =>
        handler(
          new Request("http://test/rpc", {
            method: "POST",
            body: `{"_tag":"Request","id":1,"tag":"getUsers","payload":{"users":[1,2,3]},"headers":[]}\n`
          })
        ).then((response) => response.text())
      )

      const response: RpcMessage.ResponseExitEncoded = JSON.parse(body)
      assert.deepStrictEqual(response.exit, { _tag: "Success", value: ["user-1", "user-2", "user-3"] })
      assert.deepStrictEqual(batches, [[1, 2, 3]])
    }))

  it.effect("records effect and stream encode defects on server spans, even when middleware swallows them", () =>
    Effect.gen(function*() {
      const ended = yield* Queue.unbounded<Tracer.NativeSpan>()
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          if (span.kind === "server") {
            const end = span.end.bind(span)
            span.end = (endTime, exit) => {
              end(endTime, exit)
              Queue.offerUnsafe(ended, span)
            }
          }
          return span
        }
      })
      class Swallow extends RpcMiddleware.Service<Swallow>()("Swallow") {}
      const group = RpcGroup.make(
        Rpc.make("getUserAge", { payload: Schema.Struct({}), success: Schema.Number }),
        Rpc.make("ages", { payload: Schema.Struct({}), success: Schema.Number, stream: true }).middleware(Swallow)
      )
      const handler = HttpEffect.toWebHandler(
        yield* RpcServer.toHttpEffect(group).pipe(
          Effect.provide(Layer.mergeAll(
            group.toLayer({
              getUserAge: () => Effect.succeed("not a number" as unknown as number),
              ages: () => Stream.make("not a number" as unknown as number)
            }),
            Layer.succeed(
              Swallow,
              (effect) => Effect.catchDefect(effect, () => Effect.succeed({} as RpcMiddleware.SuccessValue))
            ),
            RpcSerialization.layerNdjson
          ))
        )
      )
      yield* Effect.promise(() =>
        handler(
          new Request("http://test/rpc", {
            method: "POST",
            body: `{"_tag":"Request","id":1,"tag":"getUserAge","payload":{},"headers":[]}\n` +
              `{"_tag":"Request","id":2,"tag":"ages","payload":{},"headers":[]}\n`
          }),
          Context.make(Tracer.Tracer, tracer)
        ).then((response) => response.text())
      )

      const exits = Object.fromEntries((yield* Queue.takeN(ended, 2)).map((span) => {
        const exit = span.status._tag === "Ended" ? span.status.exit : undefined
        if (exit && Exit.isFailure(exit)) {
          assert.strictEqual(Context.getOrUndefined(Cause.annotations(exit.cause), RpcSchema.ClientAbort), undefined)
        }
        return [
          span.name,
          exit && Exit.isFailure(exit)
            ? exit.cause.reasons.map((reason) => Cause.isDieReason(reason) ? reason.defect : reason._tag)
            : exit?._tag
        ]
      }))
      assert.deepStrictEqual(exits, {
        getUserAge: [`Failed to encode response for RPC "getUserAge": Expected number\n  at ["value"]`],
        ages: [`Failed to encode response for RPC "ages": Expected number\n  at [0]`]
      })
    }))

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

  it.effect("should accept cancellation of an active request and reject new requests when client input has ended", () =>
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
          { _tag: "Ack" as const, requestId: RpcMessage.RequestId("unknown") },
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

  it.effect("isolates synchronous handler throws when fatal defects are disabled", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const group = RpcGroup.make(
        Rpc.make("pending", { success: Schema.String }),
        Rpc.make("throws", { success: Schema.String }),
        Rpc.make("throwsStream", { success: Schema.String, stream: true })
      )
      const messages = yield* Queue.unbounded<RpcMessage.FromServer<RpcGroup.Rpcs<typeof group>>>()
      const server = yield* RpcServer.makeNoSerialization(group, {
        disableFatalDefects: true,
        onFromServer: (message) => Queue.offer(messages, message).pipe(Effect.asVoid)
      }).pipe(Effect.provide(group.toLayer({
        pending: () =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as("served")),
        throws: (): Effect.Effect<string> => {
          throw "boom"
        },
        throwsStream: (): Stream.Stream<string> => {
          throw "boom stream"
        }
      })))
      const request = (id: string, tag: "pending" | "throws" | "throwsStream") => ({
        _tag: "Request" as const,
        id: RpcMessage.RequestId(id),
        tag,
        payload: undefined,
        headers: Headers.empty
      })
      yield* server.write(1, request("1", "pending"))
      yield* Deferred.await(started)
      yield* server.write(1, request("2", "throws"))
      yield* server.write(1, request("3", "throwsStream"))
      const summarize = (message: RpcMessage.FromServer<RpcGroup.Rpcs<typeof group>>): ReadonlyArray<unknown> =>
        message._tag === "Exit"
          ? [
            message.requestId,
            Exit.isSuccess(message.exit)
              ? ["Success", message.exit.value]
              : message.exit.cause.reasons.map((reason) =>
                Cause.isDieReason(reason) ? ["Die", reason.defect] : [reason._tag]
              )
          ]
          : [message._tag]
      assert.deepStrictEqual(summarize(yield* Queue.take(messages)), ["2", [["Die", "boom"]]])
      assert.deepStrictEqual(summarize(yield* Queue.take(messages)), ["3", [["Die", "boom stream"]]])
      yield* Deferred.succeed(release, undefined)
      assert.deepStrictEqual(summarize(yield* Queue.take(messages)), ["1", ["Success", "served"]])
    }))

  class Guard extends RpcMiddleware.Service<Guard>()("Guard") {}
  const DiscardGroup = RpcGroup.make(
    Rpc.make("events", { success: Schema.String, stream: true }),
    Rpc.make("guarded", { success: Schema.String }).middleware(Guard),
    Rpc.make("boom", { success: Schema.String })
  )
  const makeDiscardServer = Effect.fnUntraced(function*(release: Deferred.Deferred<void>) {
    const messages = yield* Queue.unbounded<RpcMessage.FromServer<RpcGroup.Rpcs<typeof DiscardGroup>>>()
    const server = yield* RpcServer.makeNoSerialization(DiscardGroup, {
      onFromServer: (message) => Queue.offer(messages, message).pipe(Effect.asVoid)
    }).pipe(Effect.provide(Layer.mergeAll(
      DiscardGroup.toLayer({
        events: () =>
          Stream.make("a", "b").pipe(
            Stream.concat(Stream.fromEffect(Effect.andThen(Deferred.await(release), Effect.die("boom"))))
          ),
        guarded: () => Effect.succeed("done"),
        boom: (): Effect.Effect<string> => {
          throw new Error("boom")
        }
      }),
      Layer.succeed(Guard, () => Effect.die("denied"))
    )))
    const request = (id: string, tag: "events" | "guarded" | "boom", marker: object) =>
      server.write(0, {
        _tag: "Request",
        id: RpcMessage.RequestId(id),
        tag,
        payload: undefined,
        headers: Headers.empty,
        ...marker
      })
    const takeUntilClientEnd = Effect.gen(function*() {
      yield* server.write(0, RpcMessage.constEof)
      const sent: Array<RpcMessage.FromServer<RpcGroup.Rpcs<typeof DiscardGroup>>> = []
      while (sent.at(-1)?._tag !== "ClientEnd") sent.push(yield* Queue.take(messages))
      return sent
    })
    return { messages, request, takeUntilClientEnd }
  })

  for (
    const [name, marker] of [["notification", { isNotification: true }], ["discarded call", { discard: true }]] as const
  ) {
    it.effect(`sends nothing for a running ${name}, but reports its failure`, () => {
      const reports: Array<string> = []
      return Effect.gen(function*() {
        const release = yield* Deferred.make<void>()
        const { messages, request, takeUntilClientEnd } = yield* makeDiscardServer(release)
        yield* request("id", "events", marker)
        if ("discard" in marker) {
          // acknowledged once the handler starts, not when it ends
          assert.deepStrictEqual(yield* Queue.take(messages), {
            _tag: "Exit",
            clientId: 0,
            requestId: RpcMessage.RequestId("id"),
            exit: Exit.void
          })
        }
        // no chunks, no result and no Defect, which would fail the client's other calls
        yield* Deferred.succeed(release, undefined)
        assert.deepStrictEqual(yield* takeUntilClientEnd, [{ _tag: "ClientEnd", clientId: 0 }])
        assert.deepStrictEqual(reports, ["boom"])
      }).pipe(Effect.provide(ErrorReporter.layer([ErrorReporter.make(({ error }) => reports.push(error.message))])))
    })
  }

  it.effect("fails a discarded call with its own Exit, not a Defect, when it fails before its acknowledgement", () =>
    Effect.gen(function*() {
      const { request, takeUntilClientEnd } = yield* makeDiscardServer(yield* Deferred.make<void>())
      yield* request("middleware", "guarded", { discard: true })
      yield* request("construction", "boom", { discard: true })

      const sent = yield* takeUntilClientEnd
      assert.deepStrictEqual(
        sent.map((message) =>
          message._tag === "Exit" && Exit.isFailure(message.exit)
            ? [message.requestId, String(Cause.squash(message.exit.cause))]
            : message._tag
        ),
        [["middleware", "denied"], ["construction", "Error: boom"], "ClientEnd"]
      )
    }).pipe(Effect.provide(ErrorReporter.layer([]))))

  // Feeds the lines to an ndJSON-RPC server over stdio, waits until `waits` handlers of `wait` are
  // running and the request with id 1 is answered, then returns every line the server wrote.
  const ndJsonRpcOutput = Effect.fnUntraced(function*(lines: ReadonlyArray<object>, waits: number) {
    const entered = yield* Queue.unbounded<void>()
    const release = yield* Deferred.make<void>()
    const answered = yield* Deferred.make<void>()
    const closeStdin = yield* Deferred.make<void>()
    const output: Array<string> = []
    const group = RpcGroup.make(
      Rpc.make("wait", { payload: Schema.Struct({}), success: Schema.String }),
      Rpc.make("ping", { payload: { n: Schema.Number }, success: Schema.String })
    )
    const server = yield* Layer.launch(
      RpcServer.layer(group).pipe(
        Layer.provide(group.toLayer({
          wait: () =>
            Queue.offer(entered, void 0).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as("released")
            ),
          ping: () => Effect.succeed("pong")
        })),
        Layer.provide(RpcServer.layerProtocolStdio),
        Layer.provide(RpcSerialization.layerNdJsonRpc()),
        Layer.provide(Stdio.layerTest({
          stdin: Stream.make(
            new TextEncoder().encode(lines.map((line) => JSON.stringify(line) + "\n").join(""))
          ).pipe(Stream.concat(Stream.fromEffect(Deferred.await(closeStdin)).pipe(Stream.drain))),
          stdout: () =>
            Sink.forEach((data) =>
              Effect.sync(() => output.push(String(data))).pipe(
                Effect.andThen(Deferred.succeed(answered, undefined))
              )
            )
        }))
      )
    ).pipe(Effect.forkScoped)

    yield* Queue.takeN(entered, waits)
    yield* Deferred.await(answered)
    yield* Deferred.succeed(release, undefined)
    yield* Deferred.succeed(closeStdin, undefined)
    yield* Fiber.await(server)
    return output.join("").trim().split("\n").map((line) => JSON.parse(line))
  })
  const ping = { jsonrpc: "2.0", id: 1, method: "ping", params: { n: 1 } }
  const pong = { jsonrpc: "2.0", id: 1, result: "pong" }

  it.effect("runs overlapping JSON-RPC notifications and drops invalid ones, without replying to any", () =>
    Effect.gen(function*() {
      // Both `wait` notifications arrive with the empty id, and both must run.
      const output = yield* ndJsonRpcOutput([
        { jsonrpc: "2.0", method: "wait", params: {} },
        { jsonrpc: "2.0", method: "wait", params: {} },
        { jsonrpc: "2.0", method: "missing", params: {} },
        { jsonrpc: "2.0", method: "ping", params: { n: "not a number" } },
        ping
      ], 2)
      assert.deepStrictEqual(output, [pong])
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

  it.effect("keeps interrupting disconnected clients while an onDisconnect callback is pending", () =>
    Effect.gen(function*() {
      const group = RpcGroup.make(Rpc.make("wait", { payload: Schema.Struct({}) }))
      const started = yield* Queue.unbounded<number>()
      const interrupted = yield* Queue.unbounded<number>()
      const observed = yield* Queue.unbounded<number>()
      const disconnects = yield* Queue.unbounded<number>()
      let writeRequest!: (clientId: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>
      const protocol = yield* RpcServer.Protocol.make((writeRequest_) => {
        writeRequest = writeRequest_
        return Effect.succeed({
          disconnects,
          send: () => Effect.void,
          end: () => Effect.void,
          clientIds: Effect.succeed(new Set([1, 2])),
          initialMessage: Effect.succeedNone,
          supportsAck: false,
          supportsTransferables: false,
          supportsSpanPropagation: false,
          supportsNotifications: false,
          codecFor: RpcSerialization.json.codecFor
        })
      })
      yield* RpcServer.make(group, {
        onDisconnect: (clientId) => Queue.offer(observed, clientId).pipe(Effect.andThen(Effect.never))
      }).pipe(
        Effect.provideService(RpcServer.Protocol, protocol),
        Effect.provide(group.toLayer({
          wait: (_, { client }) =>
            Queue.offer(started, client.id).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Queue.offer(interrupted, client.id))
            )
        })),
        Effect.forkScoped
      )

      for (const clientId of [1, 2]) {
        yield* writeRequest(clientId, { _tag: "Request", id: "1", tag: "wait", payload: {}, headers: [] })
        assert.strictEqual(yield* Queue.take(started), clientId)
      }
      yield* Queue.offer(disconnects, 1)
      yield* Queue.offer(disconnects, 2)

      assert.deepStrictEqual([yield* Queue.take(interrupted), yield* Queue.take(interrupted)], [1, 2])
      assert.deepStrictEqual([yield* Queue.take(observed), yield* Queue.take(observed)], [1, 2])
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
