/**
 * Runs server-side handlers for RPC groups.
 *
 * This module connects typed handlers for an `RpcGroup` to a server `Protocol`.
 * It receives client messages, decodes request payloads, runs matching handlers
 * and middleware, tracks in-flight requests, handles acknowledgements and
 * interrupts, and sends responses back to clients. It also provides constructors
 * and layers for decoded messages, HTTP, WebSocket, sockets, stdio, and worker
 * runner protocols.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Deferred from "../Deferred.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { constant, constTrue, constVoid, identity } from "../Function.ts"
import * as Headers from "../http/Headers.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerRequest from "../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import { reportCauseUnsafe } from "../internal/effect.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Queue from "../Queue.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Socket from "../socket/Socket.ts"
import * as SocketServer from "../socket/SocketServer.ts"
import { Stdio } from "../Stdio.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import type * as Types from "../Types.ts"
import * as Transferable from "../workers/Transferable.ts"
import type { WorkerError } from "../workers/WorkerError.ts"
import * as WorkerRunner from "../workers/WorkerRunner.ts"
import * as Rpc from "./Rpc.ts"
import type * as RpcGroup from "./RpcGroup.ts"
import type {
  FromClient,
  FromClientEncoded,
  FromServer,
  FromServerEncoded,
  Request,
  RequestEncoded,
  ResponseExitEncoded
} from "./RpcMessage.ts"
import { constEof, constPong, RequestId, ResponseDefectEncoded } from "./RpcMessage.ts"
import * as RpcSchema from "./RpcSchema.ts"
import * as RpcSerialization from "./RpcSerialization.ts"
import type { InitialMessage } from "./RpcWorker.ts"
import { withRun } from "./Utils.ts"

/**
 * The decoded RPC server boundary, accepting client messages for a client id
 * and allowing that client to be disconnected.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RpcServer<A extends Rpc.Any> {
  readonly write: (clientId: number, message: FromClient<A>, options?: {
    readonly onRequest?: (<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) | undefined
  }) => Effect.Effect<void>
  readonly disconnect: (clientId: number) => Effect.Effect<void>
}

/**
 * Creates an RPC server for an already-decoded message channel, running
 * handlers for a group and sending decoded server responses through
 * `onFromServer`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeNoSerialization: <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromServer: (response: FromServer<Rpcs>) => Effect.Effect<void>
    readonly disableTracing?: boolean | undefined
    readonly disableSpanPropagation?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableClientAcks?: boolean | undefined
    readonly concurrency?: number | "unbounded" | undefined
    readonly disableFatalDefects?: boolean | undefined
  }
) => Effect.Effect<
  RpcServer<Rpcs>,
  never,
  Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Scope.Scope
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromServer: (response: FromServer<Rpcs>) => Effect.Effect<void>
    readonly disableTracing?: boolean | undefined
    readonly disableSpanPropagation?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableClientAcks?: boolean | undefined
    readonly concurrency?: number | "unbounded" | undefined
    readonly disableFatalDefects?: boolean | undefined
  }
) {
  const enableTracing = options.disableTracing !== true
  const enableSpanPropagation = options.disableSpanPropagation !== true
  const supportsAck = options.disableClientAcks !== true
  const spanPrefix = options.spanPrefix ?? "RpcServer"
  const concurrency = options.concurrency ?? "unbounded"
  const disableFatalDefects = options.disableFatalDefects ?? false
  const services = yield* Effect.context<Rpc.ToHandler<Rpcs> | Scope.Scope>()
  const scope = Context.get(services, Scope.Scope)
  const trackFiber = Fiber.runIn(Scope.forkUnsafe(scope, "parallel"))
  const concurrencySemaphore = concurrency === "unbounded"
    ? undefined
    : yield* Semaphore.make(concurrency)

  type Client = {
    readonly id: number
    // lazily created: only streaming requests with client acks use latches
    latches: Map<RequestId, Latch.Latch> | undefined
    readonly fibers: Map<RequestId, Fiber.Fiber<unknown, any>>
    readonly serverClient: Rpc.ServerClient
    ended: boolean
  }

  const clients = new Map<number, Client>()
  let isShutdown = false
  const shutdownLatch = Latch.makeUnsafe(false)
  yield* Scope.addFinalizer(
    scope,
    Effect.withFiber((parent) => {
      isShutdown = true
      for (const client of clients.values()) {
        client.ended = true
        if (client.fibers.size === 0) {
          trackFiber(Effect.runForkWith(services)(endClient(client)))
          continue
        }
        for (const fiber of client.fibers.values()) {
          fiber.interruptUnsafe(parent.id)
        }
      }
      if (clients.size === 0) {
        return Effect.void
      }
      return shutdownLatch.await
    })
  )

  const disconnect = (clientId: number) =>
    Effect.withFiber((parent) => {
      const client = clients.get(clientId)
      if (!client) return Effect.void
      for (const fiber of client.fibers.values()) {
        fiber.interruptUnsafe(parent.id)
      }
      clients.delete(clientId)
      return Effect.void
    })

  const write: RpcServer<Rpcs>["write"] = (clientId, message, opts) =>
    Effect.catchDefect(
      Effect.withFiber((requestFiber) => {
        if (isShutdown) return Effect.interrupt
        let client = clients.get(clientId)
        if (!client) {
          client = {
            id: clientId,
            latches: undefined,
            fibers: new Map(),
            ended: false,
            serverClient: new Rpc.ServerClient(clientId)
          }
          clients.set(clientId, client)
        } else if (
          client.ended &&
          (message._tag !== "Interrupt" || !client.fibers.has(message.requestId))
        ) {
          return Effect.interrupt
        }

        switch (message._tag) {
          case "Request": {
            return handleRequest(requestFiber, client, message, opts)
          }
          case "Ack": {
            const latch = client.latches?.get(message.requestId)
            return latch ? latch.open : Effect.void
          }
          case "Interrupt": {
            const fiber = client.fibers.get(message.requestId)
            if (fiber) {
              fiber.interruptUnsafe(requestFiber.id, RpcSchema.ClientAbort.annotation)
              return Effect.void
            }
            return options.onFromServer({
              _tag: "Exit",
              clientId,
              requestId: message.requestId,
              exit: Exit.interrupt()
            })
          }
          case "Eof": {
            client.ended = true
            if (client.fibers.size > 0) return Effect.void
            return endClient(client)
          }
          default: {
            return sendDefect(client, `Unknown request tag: ${(message as any)._tag}`)
          }
        }
      }),
      (defect) => sendDefect(clients.get(clientId)!, defect)
    )

  const endClient = (client: Client) => {
    clients.delete(client.id)
    const write = options.onFromServer({
      _tag: "ClientEnd",
      clientId: client.id
    })
    if (isShutdown && clients.size === 0) {
      return Effect.andThen(write, shutdownLatch.open)
    }
    return write
  }

  const handleRequest = (
    requestFiber: Fiber.Fiber<any, any>,
    client: Client,
    request: Request<Rpcs>,
    opts: Parameters<RpcServer<Rpcs>["write"]>[2]
  ): Effect.Effect<void> => {
    if (client.fibers.has(request.id)) {
      return Effect.interrupt
    }
    const rpc = group.requests.get(request.tag) as any as Rpc.AnyWithProps
    const entry = Context.getOrUndefinedUnsafe(services, rpc?.key) as Rpc.Handler<Rpcs["_tag"]>
    if (!rpc || !entry) {
      const write = Effect.catchDefect(
        options.onFromServer({
          _tag: "Exit",
          clientId: client.id,
          requestId: request.id,
          exit: Exit.die(`Unknown request tag: ${request.tag}`)
        }),
        (defect) => sendDefect(client, defect)
      )
      if (!client.ended || client.fibers.size > 0) return write
      return Effect.ensuring(write, endClient(client))
    }
    const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
    const metadata = {
      rpc,
      client: client.serverClient,
      requestId: request.id,
      headers: request.headers,
      payload: request.payload
    }
    const result = entry.handler(request.payload, metadata)

    // if the handler requested forking, then we skip the concurrency control
    const isWrapper = Rpc.isWrapper(result)
    const isFork = isWrapper && result.fork
    const isUninterruptible = isWrapper && result.uninterruptible
    // unwrap the fork data type
    const streamOrEffect = isWrapper ? result.value : result
    const handler = isStream
      ? (streamEffect(client, request, streamOrEffect) as Effect.Effect<{} | Deferred.Deferred<any, any>>)
      : (streamOrEffect as Effect.Effect<{} | Deferred.Deferred<any, any>>)

    const withMiddleware = rpc.middlewares.size > 0
      ? applyMiddleware(services, handler, metadata)
      : handler
    let responded = false
    const scope = Scope.makeUnsafe()
    let deferred: Deferred.Deferred<unknown, unknown> | undefined = undefined
    let effect = Effect.onExit(withMiddleware, (exit) => {
      responded = true
      let write: Effect.Effect<void>
      if (exit._tag === "Success") {
        if (Deferred.isDeferred(exit.value)) {
          deferred = exit.value
          write = Effect.void
        } else {
          write = options.onFromServer({
            _tag: "Exit",
            clientId: client.id,
            requestId: request.id,
            exit: exit as any
          })
        }
      } else if (
        !disableFatalDefects &&
        Cause.hasDies(exit.cause) &&
        !Cause.hasInterrupts(exit.cause)
      ) {
        write = sendDefect(client, Cause.squash(exit.cause))
      } else {
        write = options.onFromServer({
          _tag: "Exit",
          clientId: client.id,
          requestId: request.id,
          exit: exit as any
        })
      }
      const close = Scope.closeUnsafe(scope, exit)
      if (exit._tag === "Failure") {
        reportCauseUnsafe(Fiber.getCurrent()!, exit.cause)
      }
      return close ? Effect.ensuring(write, close) : write
    })
    if (opts?.onRequest) {
      effect = opts.onRequest(effect)
    }
    if (enableTracing) {
      const parentSpan = Context.getOrUndefined(
        requestFiber.context,
        Tracer.ParentSpan
      )
      effect = Effect.withSpan(effect, `${spanPrefix}.${request.tag}`, {
        captureStackTrace: false,
        attributes: options.spanAttributes,
        parent: enableSpanPropagation && request.spanId
          ? Tracer.externalSpan({
            traceId: request.traceId!,
            spanId: request.spanId,
            sampled: request.sampled!
          })
          : undefined,
        links: enableSpanPropagation && parentSpan
          ? [
            {
              span: parentSpan,
              attributes: {}
            }
          ]
          : undefined
      })
    }
    if (!isFork && concurrencySemaphore) {
      effect = concurrencySemaphore.withPermit(effect)
    }
    const runFork = Effect.runForkWith(
      Context.add(handlerContext(entry, requestFiber.context), Scope.Scope, scope)
    )
    const fiber = trackFiber(
      runFork(
        effect,
        isUninterruptible ? { uninterruptible: true } : undefined
      )
    )
    client.fibers.set(request.id, fiber)
    fiber.addObserver(function onExit(exit: Exit.Exit<any, any>): void {
      if (deferred) {
        const fiber = trackFiber(runFork(Effect.onExit(Deferred.await(deferred), (exit) =>
          options.onFromServer({
            _tag: "Exit",
            clientId: client.id,
            requestId: request.id,
            exit: exit as any
          }))))
        client.fibers.set(request.id, fiber)
        deferred = undefined
        fiber.addObserver(onExit)
        return
      }
      if (!responded && exit._tag === "Failure") {
        trackFiber(
          runFork(
            options.onFromServer({
              _tag: "Exit",
              clientId: client.id,
              requestId: request.id,
              exit: Exit.interrupt()
            })
          )
        )
      }
      client.fibers.delete(request.id)
      client.latches?.delete(request.id)
      if (client.ended && client.fibers.size === 0) {
        trackFiber(runFork(endClient(client)))
      }
    })
    return Effect.void
  }

  const streamEffect = (
    client: Client,
    request: Request<Rpcs>,
    stream:
      | Stream.Stream<any, any>
      | Effect.Effect<Queue.Dequeue<any, any>, any, Scope.Scope>
  ) => {
    let latch: Latch.Latch | undefined
    if (supportsAck) {
      client.latches ??= new Map()
      latch = client.latches.get(request.id)
      if (!latch) {
        latch = Latch.makeUnsafe(false)
        client.latches.set(request.id, latch)
      }
    }
    if (Effect.isEffect(stream)) {
      return stream.pipe(
        Effect.flatMap((queue) =>
          Effect.whileLoop({
            while: constTrue,
            body: constant(
              Effect.flatMap(Queue.takeAll(queue), (values) => {
                const write = options.onFromServer({
                  _tag: "Chunk",
                  clientId: client.id,
                  requestId: request.id,
                  values
                })
                if (!latch) return write
                latch.closeUnsafe()
                return Effect.flatMap(write, () => latch.await)
              })
            ),
            step: constVoid
          })
        ),
        Pull.catchDone(() => Effect.void),
        Effect.scoped
      )
    }
    return Stream.runForEachArray(stream, (values) => {
      const write = options.onFromServer({
        _tag: "Chunk",
        clientId: client.id,
        requestId: request.id,
        values
      })
      if (!latch) return write
      latch.closeUnsafe()
      return Effect.andThen(write, latch.await)
    })
  }

  const sendDefect = (client: Client, defect: unknown) =>
    Effect.suspend(() => {
      const shouldEnd = client.ended && client.fibers.size === 0
      const write = options.onFromServer({
        _tag: "Defect",
        clientId: client.id,
        defect
      })
      if (!shouldEnd) return write
      return Effect.andThen(write, endClient(client))
    })

  return identity<RpcServer<Rpcs>>({
    write,
    disconnect
  })
})

// Merging the handler entry services with the request fiber services costs
// O(services), so the merged context is cached per (entry, fiber context)
// pair. Request fibers on persistent connections keep one context across
// requests, leaving a single O(1) overlay per request for the request scope.
const handlerContextCache = new WeakMap<
  Rpc.Handler<any>,
  WeakMap<Context.Context<never>, Context.Context<never>>
>()

const handlerContext = (
  entry: Rpc.Handler<any>,
  fiberContext: Context.Context<never>
): Context.Context<never> => {
  let cache = handlerContextCache.get(entry)
  if (cache === undefined) {
    cache = new WeakMap()
    handlerContextCache.set(entry, cache)
  }
  let merged = cache.get(fiberContext)
  if (merged === undefined) {
    merged = Context.merge(entry.context, fiberContext)
    cache.set(fiberContext, merged)
  }
  return merged
}

const applyMiddleware = <A, E, R>(
  context: Context.Context<never>,
  handler: Effect.Effect<A, E, R>,
  options: {
    readonly rpc: Rpc.AnyWithProps
    readonly client: Rpc.ServerClient
    readonly requestId: RequestId
    readonly headers: Headers.Headers
    readonly payload: unknown
  }
) => {
  for (const service of options.rpc.middlewares) {
    const middleware = Context.getUnsafe(context, service)
    handler = middleware(handler as any, options) as any
  }

  return handler
}

/**
 * Runs an RPC server for a group using the current server `Protocol`, decoding
 * requests, invoking handlers, encoding responses, and managing in-flight
 * request lifetime.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const make: <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?:
    | {
      readonly disableTracing?: boolean | undefined
      readonly spanPrefix?: string | undefined
      readonly spanAttributes?: Record<string, unknown> | undefined
      readonly concurrency?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
    }
    | undefined
) => Effect.Effect<
  never,
  never,
  | Protocol
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly concurrency?: number | "unbounded" | undefined
    readonly disableFatalDefects?: boolean | undefined
  }
) {
  const {
    codecFor,
    disconnects,
    end,
    run,
    send,
    supportsAck,
    supportsSpanPropagation,
    supportsTransferables
  } = yield* Protocol
  const encodeDefectUnsafe = Schema.encodeSync(codecFor(Schema.Defect()))
  const services = yield* Effect.context<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>>()
  const scope = yield* Scope.make()

  const server = yield* makeNoSerialization(group, {
    ...options,
    disableClientAcks: !supportsAck,
    disableSpanPropagation: !supportsSpanPropagation,
    onFromServer(response): Effect.Effect<void> {
      const client = clients.get(response.clientId)
      if (!client) return Effect.void
      switch (response._tag) {
        case "Chunk": {
          const schemas = client.schemas.get(response.requestId)
          if (!schemas) return Effect.void
          return handleEncode(
            client,
            response.requestId,
            schemas,
            schemas.encodeChunk(response.values),
            "Chunk"
          )
        }
        case "Exit": {
          const schemas = client.schemas.get(response.requestId)
          if (!schemas) return Effect.void
          client.schemas.delete(response.requestId)
          return handleEncode(
            client,
            response.requestId,
            schemas,
            schemas.encodeExit(response.exit),
            "Exit"
          )
        }
        case "Defect": {
          return sendDefect(client, response.defect)
        }
        case "ClientEnd": {
          clients.delete(response.clientId)
          return end(response.clientId)
        }
      }
    }
  }).pipe(Scope.provide(scope))

  // handle disconnects
  yield* Effect.forkChild(
    Effect.whileLoop({
      while: constTrue,
      body: constant(
        Effect.flatMap(Queue.take(disconnects), (clientId) => {
          clients.delete(clientId)
          return server.disconnect(clientId)
        })
      ),
      step: constVoid
    })
  )

  type Schemas = {
    readonly decode: (u: unknown) => Effect.Effect<Rpc.Payload<Rpcs>, Schema.SchemaError>
    readonly encodeChunk: (
      u: NonEmptyReadonlyArray<unknown>
    ) => Effect.Effect<NonEmptyReadonlyArray<unknown>, Schema.SchemaError>
    readonly encodeExit: (u: unknown) => Effect.Effect<ResponseExitEncoded["exit"], Schema.SchemaError>
    readonly encodeDefect: (u: unknown) => Effect.Effect<unknown, Schema.SchemaError>
    readonly context: Context.Context<never>
    readonly collector?: Transferable.Collector["Service"] | undefined
  }

  const schemasCache = new WeakMap<any, Schemas>()
  const getSchemas = (rpc: Rpc.AnyWithProps) => {
    let schemas = schemasCache.get(rpc)
    if (!schemas) {
      const entry = Context.getOrUndefinedUnsafe(services, rpc.key) as Rpc.Handler<Rpcs["_tag"]>
      const streamSchemas = RpcSchema.getStreamSchemas(rpc.successSchema)
      schemas = {
        decode: Schema.decodeUnknownEffect(codecFor(rpc.payloadSchema)) as any,
        encodeChunk: Schema.encodeUnknownEffect(
          codecFor(
            Schema.NonEmptyArray(Option.isSome(streamSchemas) ? streamSchemas.value.success : Schema.Any)
          )
        ) as any,
        encodeExit: Schema.encodeUnknownEffect(codecFor(Rpc.exitSchema(rpc as any))) as any,
        encodeDefect: Schema.encodeUnknownEffect(codecFor(rpc.defectSchema)) as any,
        context: entry.context
      }
      schemasCache.set(rpc, schemas)
    }
    return schemas
  }

  type Client = {
    readonly id: number
    readonly schemas: Map<RequestId, Schemas>
  }
  const clients = new Map<number, Client>()

  const responseEnvelope = (
    requestId: RequestId,
    tag: "Chunk" | "Exit",
    value: unknown
  ): FromServerEncoded =>
    tag === "Chunk"
      ? { _tag: "Chunk", requestId, values: value as NonEmptyReadonlyArray<unknown> }
      : { _tag: "Exit", requestId, exit: value as ResponseExitEncoded["exit"] }

  const handleEncode = (
    client: Client,
    requestId: RequestId,
    schemas: Schemas,
    effect: Effect.Effect<unknown, Schema.SchemaError>,
    tag: "Chunk" | "Exit"
  ) => {
    const collector = schemas.collector
    // The schema encoders evaluate eagerly, so an encode that needs no
    // services is already a resolved success and can skip the effect wrappers.
    const write = Exit.isExit(effect) && Exit.isSuccess(effect)
      ? send(client.id, responseEnvelope(requestId, tag, effect.value), collector && collector.clearUnsafe())
      : Effect.flatMap(
        Effect.provideContext(
          collector ? Effect.provideService(effect, Transferable.Collector, collector) : effect,
          schemas.context
        ),
        (value) => send(client.id, responseEnvelope(requestId, tag, value), collector && collector.clearUnsafe())
      )
    return Effect.catchCause(write, (cause) => {
      client.schemas.delete(requestId)
      const defect = Cause.squash(Cause.map(cause, (e) => SchemaIssue.defaultFormatter(e.issue)))
      return Effect.andThen(
        sendRequestDefect(client, requestId, schemas.encodeDefect, defect),
        server.write(client.id, { _tag: "Interrupt", requestId, interruptors: [] })
      )
    })
  }

  const sendRequestDefect = (
    client: Client,
    requestId: RequestId,
    encodeDefect: (u: unknown) => Effect.Effect<unknown, Schema.SchemaError>,
    defect: unknown
  ) =>
    Effect.catchCause(
      Effect.flatMap(encodeDefect(defect), (encodedDefect) =>
        send(client.id, {
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Failure",
            cause: [{
              _tag: "Die",
              defect: encodedDefect
            }]
          }
        })),
      (cause) => sendDefect(client, Cause.squash(cause))
    )

  const sendDefect = (client: Client, defect: unknown) =>
    Effect.catchCause(
      send(client.id, ResponseDefectEncoded(encodeDefectUnsafe(defect))),
      (cause) =>
        Effect.annotateLogs(Effect.logDebug(cause), {
          module: "RpcServer",
          method: "sendDefect"
        })
    )

  const writeDecodedRequest = (
    client: Client,
    requestId: RequestId,
    schemas: Schemas,
    request: RequestEncoded,
    payload: unknown
  ) => {
    client.schemas.set(
      requestId,
      supportsTransferables
        ? {
          ...schemas,
          collector: Transferable.makeCollectorUnsafe()
        }
        : schemas
    )
    // the envelope is owned by this protocol loop, so it is decoded in place
    // instead of copied for every request
    const decoded = request as Types.Mutable<RequestEncoded>
    decoded.id = requestId
    decoded.payload = payload
    decoded.headers = Headers.fromInput(request.headers) as any
    return server.write(client.id, decoded as any)
  }

  // main server loop
  return yield* run((clientId, request) => {
    let client = clients.get(clientId)
    if (!client) {
      client = {
        id: clientId,
        schemas: new Map()
      }
      clients.set(clientId, client)
    }

    switch (request._tag) {
      case "Request": {
        const tag = Object.hasOwn(request, "tag") ? (request.tag as string) : ""
        let requestId: RequestId
        switch (typeof request.id) {
          case "number":
          case "string": {
            requestId = RequestId(request.id)
            break
          }
          default: {
            return sendDefect(client, `Invalid request id: ${request.id}`)
          }
        }
        const rpc = group.requests.get(tag)
        if (!rpc) {
          return sendRequestDefect(client, requestId, (defect) => Effect.succeed(defect), `Unknown request tag: ${tag}`)
        }
        const schemas = getSchemas(rpc as any)
        const decoded = schemas.decode(request.payload)
        // The schema decoders evaluate eagerly, so a decode that needs no
        // services is already a resolved success and can skip the effect
        // wrappers.
        if (Exit.isExit(decoded) && Exit.isSuccess(decoded)) {
          return writeDecodedRequest(client, requestId, schemas, request, decoded.value)
        }
        return Effect.matchEffect(
          Effect.provideContext(decoded, schemas.context),
          {
            onFailure: (error) =>
              sendRequestDefect(client, requestId, schemas.encodeDefect, SchemaIssue.defaultFormatter(error.issue)),
            onSuccess: (payload) => writeDecodedRequest(client, requestId, schemas, request, payload)
          }
        )
      }
      case "Ping": {
        return Effect.catchCause(send(client.id, constPong), (cause) => sendDefect(client, Cause.squash(cause)))
      }
      case "Eof": {
        return server.write(clientId, request)
      }
      case "Ack": {
        // the branded `RequestId` shares the runtime representation of the
        // encoded id, so the message can be forwarded as-is
        return server.write(clientId, request as FromClient<Rpcs>)
      }
      case "Interrupt": {
        return server.write(clientId, {
          ...request,
          requestId: RequestId(request.requestId),
          interruptors: []
        })
      }
      default: {
        return sendDefect(client, `Unknown request tag: ${(request as any)._tag}`)
      }
    }
  }).pipe(
    Effect.tapCause((cause) => Effect.logFatal("BUG: RpcServer protocol crashed", cause)),
    Effect.onExit((exit) => Scope.close(scope, exit))
  )
})

/**
 * Provides a scoped layer that starts an RPC server for a group using the
 * current server `Protocol`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly concurrency?: number | "unbounded" | undefined
    readonly disableFatalDefects?: boolean | undefined
  }
): Layer.Layer<
  never,
  never,
  | Protocol
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>
> => Layer.effectDiscard(Effect.forkScoped(make(group, options)))

/**
 * Creates a RPC server that registers a HTTP route with a `HttpRouter`.
 *
 * **Details**
 *
 * Defaults to using websockets for communication, but can be configured to use
 * HTTP.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttp = <Rpcs extends Rpc.Any>(options: {
  readonly group: RpcGroup.RpcGroup<Rpcs>
  readonly path: HttpRouter.PathInput
  readonly protocol?: "http" | "websocket" | undefined
  readonly disableTracing?: boolean | undefined
  readonly spanPrefix?: string | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly concurrency?: number | "unbounded" | undefined
  readonly disableFatalDefects?: boolean | undefined
  readonly streamBufferSize?: number | "unbounded" | undefined
}): Layer.Layer<
  never,
  never,
  | RpcSerialization.RpcSerialization
  | HttpRouter.HttpRouter
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>
> =>
  layer(options.group, options).pipe(
    Layer.provide(
      options.protocol === "http"
        ? layerProtocolHttp(options)
        : layerProtocolWebsocket(options)
    )
  )

/**
 * Defines the service interface for an RPC server transport, responsible for receiving
 * encoded client messages, sending encoded responses, tracking clients, and
 * declaring transport capabilities.
 *
 * **When to use**
 *
 * Use to provide the transport boundary for RPC servers over HTTP, WebSocket,
 * workers, sockets, or custom protocols.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Protocol extends Context.Service<
  Protocol,
  {
    readonly run: (
      f: (clientId: number, data: FromClientEncoded) => Effect.Effect<void>
    ) => Effect.Effect<never>
    readonly disconnects: Queue.Dequeue<number>
    readonly send: (
      clientId: number,
      response: FromServerEncoded,
      transferables?: ReadonlyArray<globalThis.Transferable>
    ) => Effect.Effect<void>
    readonly end: (clientId: number) => Effect.Effect<void>
    readonly clientIds: Effect.Effect<ReadonlySet<number>>
    readonly initialMessage: Effect.Effect<Option.Option<unknown>>
    readonly supportsAck: boolean
    readonly supportsTransferables: boolean
    readonly supportsSpanPropagation: boolean
    readonly supportsNotifications: boolean
    /**
     * Builds the codec that fills the `unknown` holes of the protocol messages,
     * re-passed from the `RpcSerialization` backing this transport.
     */
    readonly codecFor: RpcSerialization.CodecFor
  }
>()("effect/rpc/RpcServer/Protocol") {
  /**
   * Creates a server protocol service from the supplied RPC implementation.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static make = withRun<Protocol["Service"]>()
}

/**
 * Creates a server `Protocol` backed by the current `SocketServer`, accepting
 * socket connections and routing decoded RPC messages.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolSocketServer = Effect.gen(function*() {
  const server = yield* SocketServer.SocketServer
  const { onSocket, protocol } = yield* makeSocketProtocol
  yield* Effect.forkScoped(
    server.run((socket) => Effect.scoped(onSocket(socket)))
  )
  return protocol
})

/**
 * RPC protocol that uses `SocketServer` for communication.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolSocketServer: Layer.Layer<
  Protocol,
  never,
  RpcSerialization.RpcSerialization | SocketServer.SocketServer
> = Layer.effect(Protocol)(makeProtocolSocketServer)

/**
 * Creates a websocket server `Protocol` together with an HTTP effect that
 * upgrades the current request to a websocket and attaches it to the protocol.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolWithHttpEffectWebsocket: Effect.Effect<
  {
    readonly protocol: Protocol["Service"]
    readonly httpEffect: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      Scope.Scope | HttpServerRequest.HttpServerRequest
    >
  },
  never,
  RpcSerialization.RpcSerialization
> = Effect.gen(function*() {
  const { onSocket, protocol } = yield* makeSocketProtocol

  const httpEffect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    Scope.Scope | HttpServerRequest.HttpServerRequest
  > = Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const socket = yield* Effect.orDie(request.upgrade)
    yield* onSocket(socket, Object.entries(request.headers))
    return HttpServerResponse.empty()
  })

  return { protocol, httpEffect } as const
})

/**
 * Creates a websocket server `Protocol` and registers its upgrade handler as a
 * GET route on the current `HttpRouter`.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolWebsocket: (options: {
  readonly path: HttpRouter.PathInput
}) => Effect.Effect<
  Protocol["Service"],
  never,
  RpcSerialization.RpcSerialization | HttpRouter.HttpRouter
> = Effect.fnUntraced(function*(options) {
  const { httpEffect, protocol } = yield* makeProtocolWithHttpEffectWebsocket
  const router = yield* HttpRouter.HttpRouter
  yield* router.add("GET", options.path, httpEffect)
  return protocol
})

/**
 * RPC protocol that uses WebSockets for communication.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolWebsocket = (options: {
  readonly path: HttpRouter.PathInput
}): Layer.Layer<
  Protocol,
  never,
  RpcSerialization.RpcSerialization | HttpRouter.HttpRouter
> => {
  return Layer.effect(Protocol)(makeProtocolWebsocket(options))
}

/**
 * Creates an HTTP request/response server `Protocol` together with an HTTP
 * effect that decodes the current request and streams or returns encoded RPC
 * responses.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolWithHttpEffect: (
  options?: {
    readonly streamBufferSize?: number | "unbounded" | undefined
  } | undefined
) => Effect.Effect<
  {
    readonly protocol: Protocol["Service"]
    readonly httpEffect: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      Scope.Scope | HttpServerRequest.HttpServerRequest
    >
  },
  never,
  RpcSerialization.RpcSerialization
> = Effect.fnUntraced(function*(options = {}) {
  const serialization = yield* RpcSerialization.RpcSerialization
  const encodeDefectUnsafe = Schema.encodeSync(serialization.codecFor(Schema.Defect()))
  const includesFraming = serialization.includesFraming
  const isBinary = !serialization.contentType.includes("json")

  const disconnects = yield* Queue.make<number>()
  let writeRequest!: (
    clientId: number,
    message: FromClientEncoded
  ) => Effect.Effect<void>

  let clientId = 0

  type Client = {
    readonly write: (bytes: FromServerEncoded) => Effect.Effect<void>
    readonly end: Effect.Effect<void>
  }
  const clients = new Map<number, Client>()
  const clientIds = new Set<number>()

  const encoder = new TextEncoder()

  const httpEffect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    Scope.Scope | HttpServerRequest.HttpServerRequest
  > = Effect.gen(function*() {
    const fiber = Fiber.getCurrent()!
    const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest)
    const scope = Context.getUnsafe(fiber.context, Scope.Scope)
    const requestHeaders = Object.entries(request.headers)
    const data = yield* Effect.orDie<string | Uint8Array, any, never>(
      isBinary ? Effect.map(request.arrayBuffer, (buf) => new Uint8Array(buf)) : request.text
    )
    const id = clientId++
    const queue = yield* Queue.make<Uint8Array | FromServerEncoded, Cause.Done>({
      capacity: includesFraming && options.streamBufferSize !== "unbounded"
        ? options.streamBufferSize ?? 16
        : undefined
    })
    const parser = serialization.makeUnsafe()
    const requestIds: Array<RequestId> = []

    const offer = (data: Uint8Array | string) =>
      typeof data === "string" ? Queue.offer(queue, encoder.encode(data)) : Queue.offer(queue, data)
    const client: Client = {
      write: !includesFraming
        ? (response) =>
          // buffered responses cannot carry notifications, so they are dropped
          response._tag === "Request" && response.isNotification === true
            ? Effect.void
            : Queue.offer(queue, response)
        : (response) => {
          try {
            const encoded = parser.encode(response)
            if (encoded === undefined) return Effect.void
            return offer(encoded)
          } catch (cause) {
            return offer(parser.encode(ResponseDefectEncoded(encodeDefectUnsafe(cause)))!)
          }
        },
      end: Queue.end(queue)
    }

    yield* Scope.addFinalizerExit(scope, () => {
      clients.delete(id)
      clientIds.delete(id)
      Queue.offerUnsafe(disconnects, id)
      if (queue.state._tag === "Done") return Effect.void
      return Effect.andThen(
        Queue.shutdown(queue),
        Effect.forEach(
          requestIds,
          (requestId) => writeRequest(id, { _tag: "Interrupt", requestId }),
          { discard: true }
        )
      )
    })
    clients.set(id, client)
    clientIds.add(id)

    // @effect-diagnostics-next-line tryCatchInEffectGen:off
    try {
      const decoded = parser.decode(data) as ReadonlyArray<FromClientEncoded>
      for (let i = 0; i < decoded.length; i++) {
        const message = decoded[i]
        if (message._tag === "Request") {
          requestIds.push(RequestId(message.id))
          ;(message as Types.Mutable<RequestEncoded>).headers = requestHeaders.concat(message.headers)
        }
        yield* writeRequest(id, message)
      }
    } catch (cause) {
      yield* client.write(ResponseDefectEncoded(encodeDefectUnsafe(cause)))
    }

    yield* writeRequest(id, constEof)

    if (!includesFraming) {
      const responses = yield* Queue.collect(queue)
      // Notification-only batches encode without a response body.
      const encoded = parser.encode(responses)
      return HttpServerResponse.text(encoded === undefined ? "" : encoded as string, {
        contentType: serialization.contentType
      })
    }

    const initialChunk = yield* Queue.takeAll(queue) as any as Effect.Effect<NonEmptyReadonlyArray<Uint8Array>>
    if (queue.state._tag === "Done") {
      return HttpServerResponse.uint8Array(mergeUint8Arrays(initialChunk), {
        contentType: serialization.contentType
      })
    }

    return HttpServerResponse.stream(
      Stream.fromArray(initialChunk).pipe(
        Stream.concat(
          Stream.fromQueue(queue as Queue.Dequeue<Uint8Array, Cause.Done>)
        )
      ),
      { contentType: serialization.contentType }
    )
  })

  const protocol = yield* Protocol.make((writeRequest_) => {
    writeRequest = writeRequest_
    return Effect.succeed({
      disconnects,
      send(clientId, response) {
        const client = clients.get(clientId)
        if (!client) return Effect.void
        return client.write(response)
      },
      end(clientId) {
        const client = clients.get(clientId)
        if (!client) return Effect.void
        return client.end
      },
      clientIds: Effect.sync(() => clientIds),
      initialMessage: Effect.succeedNone,
      supportsAck: false,
      supportsTransferables: false,
      supportsSpanPropagation: false,
      supportsNotifications: includesFraming,
      codecFor: serialization.codecFor
    })
  })

  return { protocol, httpEffect } as const
})

const mergeUint8Arrays = (arrays: ReadonlyArray<Uint8Array>) => {
  if (arrays.length === 0) return new Uint8Array(0)
  if (arrays.length === 1) return arrays[0]
  const length = arrays.reduce((acc, arr) => acc + arr.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Creates an HTTP server `Protocol` and registers its request handler as a POST
 * route on the current `HttpRouter`.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolHttp: (options: {
  readonly path: HttpRouter.PathInput
  readonly streamBufferSize?: number | "unbounded" | undefined
}) => Effect.Effect<
  Protocol["Service"],
  never,
  RpcSerialization.RpcSerialization | HttpRouter.HttpRouter
> = Effect.fnUntraced(function*(options) {
  const { httpEffect, protocol } = yield* makeProtocolWithHttpEffect(options)
  const router = yield* HttpRouter.HttpRouter
  yield* router.add("POST", options.path, httpEffect)
  return protocol
})

/**
 * Provides a server `Protocol` that uses HTTP POST requests for RPC
 * communication.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolHttp = (options: {
  readonly path: HttpRouter.PathInput
  readonly streamBufferSize?: number | "unbounded" | undefined
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpRouter.HttpRouter> => {
  return Layer.effect(Protocol)(makeProtocolHttp(options))
}

/**
 * Starts an RPC server for a group and returns the HTTP request/response effect
 * that serves the non-websocket HTTP RPC protocol.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const toHttpEffect: <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableFatalDefects?: boolean | undefined
    readonly streamBufferSize?: number | "unbounded" | undefined
  } | undefined
) => Effect.Effect<
  Effect.Effect<HttpServerResponse.HttpServerResponse, never, Scope.Scope | HttpServerRequest.HttpServerRequest>,
  never,
  | Scope.Scope
  | RpcSerialization.RpcSerialization
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableFatalDefects?: boolean | undefined
    readonly streamBufferSize?: number | "unbounded" | undefined
  }
) {
  const { httpEffect, protocol } = yield* makeProtocolWithHttpEffect(options)
  yield* make(group, options).pipe(
    Effect.provideService(Protocol, protocol),
    Effect.forkScoped
  )
  // @effect-diagnostics-next-line returnEffectInGen:off
  return httpEffect
})

/**
 * Starts an RPC server for a group and returns the HTTP effect that upgrades
 * requests to the websocket RPC protocol.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const toHttpEffectWebsocket: <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableFatalDefects?: boolean | undefined
  } | undefined
) => Effect.Effect<
  Effect.Effect<HttpServerResponse.HttpServerResponse, never, Scope.Scope | HttpServerRequest.HttpServerRequest>,
  never,
  | Scope.Scope
  | RpcSerialization.RpcSerialization
  | Rpc.ToHandler<Rpcs>
  | Rpc.Middleware<Rpcs>
  | Rpc.ServicesServer<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly disableTracing?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly disableFatalDefects?: boolean | undefined
  }
) {
  const { httpEffect, protocol } = yield* makeProtocolWithHttpEffectWebsocket
  yield* make(group, options).pipe(
    Effect.provideService(Protocol, protocol),
    Effect.forkScoped
  )
  // @effect-diagnostics-next-line returnEffectInGen:off
  return httpEffect
})

/**
 * Creates a server `Protocol` that reads RPC messages from `Stdio.stdin` and
 * writes encoded responses to `Stdio.stdout`.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolStdio = Effect.gen(function*() {
  const stdio = yield* Stdio
  const fiber = Fiber.getCurrent()!
  const serialization = yield* RpcSerialization.RpcSerialization

  return yield* Protocol.make(Effect.fnUntraced(function*(writeRequest) {
    const queue = yield* Queue.bounded<Uint8Array | string, Cause.Done>(8)
    const parser = serialization.makeUnsafe()

    yield* stdio.stdin.pipe(
      Stream.runForEach((data) => {
        const decoded = parser.decode(data) as ReadonlyArray<FromClientEncoded>
        if (decoded.length === 0) return Effect.void
        let i = 0
        return Effect.whileLoop({
          while: () => i < decoded.length,
          body: () => writeRequest(0, decoded[i++]),
          step: constVoid
        })
      }),
      Effect.sandbox,
      Effect.tapError(Effect.logError),
      Effect.retry(Schedule.spaced(500)),
      Effect.andThen(() => writeRequest(0, constEof)),
      Effect.forkScoped
    )

    yield* Stream.fromQueue(queue).pipe(
      Stream.run(stdio.stdout()),
      Effect.retry(Schedule.spaced(500)),
      Effect.ensuring(Effect.forkDetach(Fiber.interrupt(fiber), { startImmediately: true })),
      Effect.forkScoped
    )

    return {
      disconnects: yield* Queue.make<number>(),
      send(_clientId, response) {
        const responseEncoded = parser.encode(response)
        if (responseEncoded === undefined) {
          return Effect.void
        }
        return Queue.offer(queue, responseEncoded)
      },
      end(_clientId) {
        return Queue.end(queue)
      },
      clientIds: Effect.succeed(new Set([0])),
      initialMessage: Effect.succeedNone,
      supportsAck: true,
      supportsTransferables: false,
      supportsSpanPropagation: true,
      supportsNotifications: true,
      codecFor: serialization.codecFor
    }
  }))
})

/**
 * Provides a server `Protocol` that reads RPC messages from `Stdio.stdin` and
 * writes encoded responses to `Stdio.stdout`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolStdio: Layer.Layer<
  Protocol,
  never,
  RpcSerialization.RpcSerialization | Stdio
> = Layer.effect(Protocol, makeProtocolStdio)

/**
 * Creates a server `Protocol` backed by `WorkerRunnerPlatform`, routing worker
 * messages to the RPC server and server responses back to workers.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolWorkerRunner: Effect.Effect<
  Protocol["Service"],
  WorkerError,
  WorkerRunner.WorkerRunnerPlatform | Scope.Scope
> = Protocol.make(Effect.fnUntraced(function*(writeRequest) {
  const fiber = Fiber.getCurrent()!
  const runner = yield* WorkerRunner.WorkerRunnerPlatform
  const backing = yield* runner.start<FromServerEncoded, FromClientEncoded | InitialMessage.Encoded>()
  const initialMessage = yield* Deferred.make<unknown>()
  const clientIds = new Set<number>()
  const disconnects = yield* Queue.make<number>()

  yield* backing.run((clientId, message) => {
    clientIds.add(clientId)
    if (message._tag === "InitialMessage") {
      return Deferred.succeed(initialMessage, message.value)
    }
    return writeRequest(clientId, message)
  }).pipe(
    Effect.tapCause(Effect.logError),
    Effect.onExit(() =>
      Effect.sync(() => {
        fiber.currentDispatcher.scheduleTask(() => fiber.interruptUnsafe(fiber.id), 0)
      })
    ),
    Effect.forkScoped
  )

  if (backing.disconnects) {
    yield* Queue.take(backing.disconnects).pipe(
      Effect.tap((clientId) => {
        clientIds.delete(clientId)
        return Queue.offer(disconnects, clientId)
      }),
      Effect.forever,
      Effect.forkScoped
    )
  }

  return {
    disconnects,
    send: backing.send,
    end(_clientId) {
      return Effect.void
    },
    clientIds: Effect.sync(() => clientIds),
    initialMessage: Effect.asSome(Deferred.await(initialMessage)),
    supportsAck: true,
    supportsTransferables: true,
    supportsSpanPropagation: true,
    supportsNotifications: true,
    // Worker protocols use structured clone, so they do not depend on
    // `RpcSerialization`. A binary worker protocol is a separate protocol.
    codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
  }
}))

/**
 * Provides a server `Protocol` backed by the current `WorkerRunnerPlatform`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolWorkerRunner: Layer.Layer<
  Protocol,
  WorkerError,
  WorkerRunner.WorkerRunnerPlatform
> = Layer.effect(Protocol)(makeProtocolWorkerRunner)

// internal

const makeSocketProtocol: Effect.Effect<
  {
    readonly protocol: Protocol["Service"]
    readonly onSocket: (
      socket: Socket.Socket,
      headers?: ReadonlyArray<[string, string]>
    ) => Effect.Effect<void, never, Scope.Scope>
  },
  never,
  RpcSerialization.RpcSerialization
> = Effect.gen(function*() {
  const serialization = yield* RpcSerialization.RpcSerialization
  const encodeDefectUnsafe = Schema.encodeSync(serialization.codecFor(Schema.Defect()))
  const disconnects = yield* Queue.make<number>()

  let clientId = 0
  const clients = new Map<number, {
    readonly write: (bytes: FromServerEncoded) => Effect.Effect<void>
  }>()
  const clientIds = new Set<number>()

  let writeRequest!: (clientId: number, message: FromClientEncoded) => Effect.Effect<void>

  const onSocket = Effect.fnUntraced(function*(socket: Socket.Socket, headers?: ReadonlyArray<[string, string]>) {
    const scope = yield* Effect.scope
    const parser = serialization.makeUnsafe()
    const id = clientId++
    yield* Scope.addFinalizerExit(scope, () => {
      clients.delete(id)
      clientIds.delete(id)
      return Queue.offer(disconnects, id)
    })

    const writer = yield* socket.writer
    const write = (response: FromServerEncoded) => {
      try {
        const encoded = parser.encode(response)
        if (encoded === undefined) {
          return Effect.void
        }
        return Effect.orDie(writer.write(encoded))
      } catch (cause) {
        return Effect.orDie(
          writer.write(parser.encode(ResponseDefectEncoded(encodeDefectUnsafe(cause)))!)
        )
      }
    }
    clients.set(id, { write })
    clientIds.add(id)

    const processData = (data: Uint8Array | string): Effect.Effect<void, Socket.SocketError> => {
      try {
        const decoded = parser.decode(data) as ReadonlyArray<FromClientEncoded>
        if (decoded.length === 0) return Effect.void
        let i = 0
        return Effect.whileLoop({
          while: () => i < decoded.length,
          body() {
            const message = decoded[i++]
            if (message._tag === "Request" && headers) {
              ;(message as Types.Mutable<RequestEncoded>).headers = headers.concat(message.headers)
            }
            return writeRequest(id, message)
          },
          step: constVoid
        })
      } catch (cause) {
        if (Predicate.isTagged(cause, "MaxBufferSizeExceeded")) {
          return writer.write(new Socket.CloseEvent(1009, String(cause)))
        }
        return writer.write(parser.encode(ResponseDefectEncoded(encodeDefectUnsafe(cause)))!)
      }
    }

    yield* Effect.gen(function*() {
      const { pull } = yield* socket.reader
      while (true) {
        const frames = yield* pull
        for (let i = 0; i < frames.length; i++) {
          yield* processData(frames[i])
        }
      }
    }).pipe(
      Effect.catchReason("SocketError", "SocketCloseError", (_) => Effect.void),
      Effect.orDie
    )
  })

  const protocol = yield* Protocol.make((writeRequest_) => {
    writeRequest = writeRequest_
    return Effect.succeed({
      disconnects,
      send: (clientId, response) => {
        const client = clients.get(clientId)
        if (!client) return Effect.void
        return Effect.orDie(client.write(response))
      },
      end(_clientId) {
        return Effect.void
      },
      clientIds: Effect.sync(() => clientIds),
      initialMessage: Effect.succeedNone,
      supportsAck: true,
      supportsTransferables: false,
      supportsSpanPropagation: true,
      supportsNotifications: true,
      codecFor: serialization.codecFor
    })
  })

  return { protocol, onSocket } as const
})
