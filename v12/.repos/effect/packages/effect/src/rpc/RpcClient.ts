/**
 * Runs typed RPC calls from the client side.
 *
 * This module turns RPC definitions from an `RpcGroup` into callable client
 * methods. Each call encodes its payload, sends a message through the active
 * `Protocol`, decodes exits or stream chunks from the server, and routes the
 * response back to the waiting `Effect`, `Stream`, or queue. It also defines
 * the protocol service and includes protocol layers for HTTP, sockets, and
 * workers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Deferred from "../Deferred.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { constVoid, dual, flow, identity } from "../Function.ts"
import * as Headers from "../http/Headers.ts"
import * as HttpBody from "../http/HttpBody.ts"
import * as HttpClient from "../http/HttpClient.ts"
import { HttpClientErrorSchema } from "../http/HttpClientError.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Pool from "../Pool.ts"
import * as Predicate from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import * as Result from "../Result.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import type * as Struct from "../Struct.ts"
import type { Span } from "../Tracer.ts"
import * as Transferable from "../workers/Transferable.ts"
import * as Worker from "../workers/Worker.ts"
import type { WorkerError } from "../workers/WorkerError.ts"
import * as RpcTracing from "./internal/tracing.ts"
import * as Rpc from "./Rpc.ts"
import { RpcClientDefect, RpcClientError } from "./RpcClientError.ts"
import type * as RpcGroup from "./RpcGroup.ts"
import type {
  FromClient,
  FromClientEncoded,
  FromServer,
  FromServerEncoded,
  Request,
  RequestEncoded
} from "./RpcMessage.ts"
import { constPing, isTerminalResponse, RequestId } from "./RpcMessage.ts"
import type * as RpcMiddleware from "./RpcMiddleware.ts"
import * as RpcSchema from "./RpcSchema.ts"
import * as RpcSerialization from "./RpcSerialization.ts"
import * as RpcWorker from "./RpcWorker.ts"
import { withRunClient } from "./Utils.ts"

const isRpcClientError = (u: unknown): u is RpcClientError => Predicate.isTagged(u, "RpcClientError")

/**
 * The object-shaped client generated from a union of RPC definitions, with one
 * method per RPC tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type RpcClient<Rpcs extends Rpc.Any, E = never> = Struct.Simplify<RpcClient.From<Rpcs, E>>

/**
 * Type-level helpers for deriving RPC client call signatures from RPC
 * definitions.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace RpcClient {
  /**
   * Builds an object client type from an RPC union, mapping each RPC tag to a
   * method that accepts the RPC payload and returns either an `Effect` or
   * `Stream` based on the RPC success schema.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type From<Rpcs extends Rpc.Any, E = never> = {
    readonly [Current in Rpcs as Current["_tag"]]: <
      const AsQueue extends boolean = false,
      const Discard = false
    >(
      input: Rpc.PayloadConstructor<Current>,
      options?: Rpc.Success<Current> extends Stream.Stream<infer _A, infer _E, infer _R> ? {
          readonly asQueue?: AsQueue | undefined
          readonly streamBufferSize?: number | undefined
          readonly headers?: Headers.Input | undefined
          readonly context?: Context.Context<never> | undefined
        } :
        {
          readonly headers?: Headers.Input | undefined
          readonly context?: Context.Context<never> | undefined
          /**
           * Completes once the server acknowledges the call as its handler starts,
           * after the middleware has run, instead of waiting for the result. The
           * handler's result and error are not returned, but transport errors,
           * middleware errors and failures before the handler starts still fail the
           * call. Over HTTP and workers the call completes after the handler has
           * finished. A protocol that only delivers requests acknowledges the call
           * itself once it has delivered the request.
           */
          readonly discard?: Discard | undefined
        }
    ) => Current extends Rpc.Rpc<
      infer _Tag,
      infer _Payload,
      infer _Success,
      infer _Error,
      infer _Middleware,
      infer _Requires
    > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? AsQueue extends true ? Effect.Effect<
            Queue.Dequeue<
              _A["Type"],
              _E["Type"] | _Error["Type"] | E | _Middleware["error"]["Type"] | _Middleware["~ClientError"] | Cause.Done
            >,
            never,
            | Scope.Scope
            | _Payload["EncodingServices"]
            | _Success["DecodingServices"]
            | _Error["DecodingServices"]
            | _Middleware["error"]["DecodingServices"]
          >
        : Stream.Stream<
          _A["Type"],
          _E["Type"] | _Error["Type"] | E | _Middleware["error"]["Type"] | _Middleware["~ClientError"],
          | _Payload["EncodingServices"]
          | _Success["DecodingServices"]
          | _Error["DecodingServices"]
          | _Middleware["error"]["DecodingServices"]
        >
      : Effect.Effect<
        Discard extends true ? void : _Success["Type"],
        | (Discard extends true ? never : _Error["Type"])
        | E
        | _Middleware["error"]["Type"]
        | _Middleware["~ClientError"],
        | _Payload["EncodingServices"]
        | _Success["DecodingServices"]
        | _Error["DecodingServices"]
        | _Middleware["error"]["DecodingServices"]
      > :
      never
  }

  /**
   * Builds a flattened RPC client function that accepts an RPC tag and payload,
   * returning the corresponding `Effect` or `Stream` for that RPC.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Flat<Rpcs extends Rpc.Any, E = never> = <
    const Tag extends Rpcs["_tag"],
    const AsQueue extends boolean = false,
    const Discard = false
  >(
    tag: Tag,
    payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>,
    options?: Rpc.Success<Rpc.ExtractTag<Rpcs, Tag>> extends Stream.Stream<infer _A, infer _E, infer _R> ? {
        readonly asQueue?: AsQueue | undefined
        readonly streamBufferSize?: number | undefined
        readonly headers?: Headers.Input | undefined
        readonly context?: Context.Context<never> | undefined
      } :
      {
        readonly headers?: Headers.Input | undefined
        readonly context?: Context.Context<never> | undefined
        /**
         * Completes once the server acknowledges the call as its handler starts,
         * after the middleware has run, instead of waiting for the result. The
         * handler's result and error are not returned, but transport errors,
         * middleware errors and failures before the handler starts still fail the
         * call. Over HTTP and workers the call completes after the handler has
         * finished. A protocol that only delivers requests acknowledges the call
         * itself once it has delivered the request.
         */
        readonly discard?: Discard | undefined
      }
  ) => Rpcs extends Rpc.Rpc<
    infer _Tag extends Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? AsQueue extends true ? Effect.Effect<
          Queue.Dequeue<
            _A["Type"],
            _E["Type"] | _Error["Type"] | E | _Middleware["error"]["Type"] | _Middleware["~ClientError"]
          >,
          never,
          | Scope.Scope
          | _Payload["EncodingServices"]
          | _Success["DecodingServices"]
          | _Error["DecodingServices"]
          | _Middleware["error"]["DecodingServices"]
        >
      : Stream.Stream<
        _A["Type"],
        _E["Type"] | _Error["Type"] | E | _Middleware["error"]["Type"] | _Middleware["~ClientError"],
        | _Payload["EncodingServices"]
        | _Success["DecodingServices"]
        | _Error["DecodingServices"]
        | _Middleware["error"]["DecodingServices"]
      >
    : Effect.Effect<
      Discard extends true ? void : _Success["Type"],
      (Discard extends true ? never : _Error["Type"]) | E | _Middleware["error"]["Type"] | _Middleware["~ClientError"],
      | _Payload["EncodingServices"]
      | _Success["DecodingServices"]
      | _Error["DecodingServices"]
      | _Middleware["error"]["DecodingServices"]
    > :
    never
}

/**
 * Derives the object-shaped RPC client type for all RPCs contained in an
 * `RpcGroup`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type FromGroup<Group, E = never> = RpcClient<RpcGroup.Rpcs<Group>, E>

let requestIdCounter = 0

/**
 * Creates an RPC client for an already-decoded message channel, returning the
 * client API together with a `write` function for delivering server messages
 * back to the client.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeNoSerialization: <Rpcs extends Rpc.Any, E, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromClient: (
      options: {
        readonly message: FromClient<Rpcs>
        readonly context: Context.Context<never>
      }
    ) => Effect.Effect<void, E>
    readonly supportsAck?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly flatten?: Flatten | undefined
  }
) => Effect.Effect<
  {
    readonly client: Flatten extends true ? RpcClient.Flat<Rpcs, E> : RpcClient<Rpcs, E>
    readonly write: (message: FromServer<Rpcs>) => Effect.Effect<void>
  },
  never,
  Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any, E, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly onFromClient: (
      options: {
        readonly message: FromClient<Rpcs>
        readonly context: Context.Context<never>
      }
    ) => Effect.Effect<void, E>
    readonly supportsAck?: boolean | undefined
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly flatten?: Flatten | undefined
  }
) {
  const spanPrefix = options.spanPrefix
  const supportsAck = options?.supportsAck ?? true
  const disableTracing = options?.disableTracing ?? false
  const generateRequestId = options?.generateRequestId ?? (() => requestIdCounter++ as RequestId)

  const services = yield* Effect.context<Rpc.MiddlewareClient<Rpcs> | Scope.Scope>()
  const scope = Context.get(services, Scope.Scope)

  type ClientEntry = {
    readonly _tag: "Effect"
    readonly rpc: Rpc.AnyWithProps
    readonly context: Context.Context<never>
    resume: (_: Exit.Exit<any, any>) => void
  } | {
    readonly _tag: "Queue"
    readonly rpc: Rpc.AnyWithProps
    readonly queue: Queue.Queue<any, any>
    readonly scope: Scope.Scope
    readonly context: Context.Context<never>
  }
  const entries = new Map<RequestId, ClientEntry>()

  let isShutdown = false
  yield* Scope.addFinalizer(
    scope,
    Effect.withFiber((parent) => {
      isShutdown = true
      return clearEntries(Exit.interrupt(parent.id))
    })
  )

  const clearEntries = Effect.fnUntraced(function*(exit: Exit.Exit<never>) {
    // Resuming callers can synchronously start new requests.
    const pending = Array.from(entries.values())
    entries.clear()
    // Once detached, every entry must complete even if delivery is interrupted.
    for (const entry of pending) {
      if (entry._tag === "Queue") {
        yield* (exit._tag === "Success"
          ? Queue.end(entry.queue as any)
          : Queue.failCause(entry.queue as any, exit.cause)) as Effect.Effect<void>
      } else {
        entry.resume(exit)
      }
    }
  }, Effect.uninterruptible)

  const onRequest = (rpc: Rpc.AnyWithProps) => {
    const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
    const middleware = getRpcClientMiddleware(rpc)
    return (payload: any, opts?: {
      readonly asQueue?: boolean | undefined
      readonly streamBufferSize?: number | undefined
      readonly headers?: Headers.Input | undefined
      readonly context?: Context.Context<never> | undefined
      readonly discard?: boolean | undefined
    }) => {
      const headers = opts?.headers ? Headers.fromInput(opts.headers) : Headers.empty
      const context = opts?.context ?? Context.empty()
      if (!isStream) {
        const onRequest = (span: Span | undefined) =>
          onEffectRequest(
            rpc,
            middleware,
            span,
            rpc.payloadSchema.make(payload),
            headers,
            context,
            opts?.discard ?? false
          )
        return disableTracing ? onRequest(undefined) : Effect.useSpan(
          RpcTracing.spanName(spanPrefix, rpc._tag),
          { kind: "client", attributes: RpcTracing.spanAttributes(rpc._tag, options.spanAttributes) },
          onRequest
        )
      }
      const queue = onStreamRequest(
        rpc,
        middleware,
        rpc.payloadSchema.make(payload),
        headers,
        opts?.streamBufferSize ?? 16,
        context
      )
      if (opts?.asQueue) return queue
      return Stream.unwrap(Effect.map(queue, Stream.fromQueue))
    }
  }

  const onEffectRequest = (
    rpc: Rpc.AnyWithProps,
    middleware: (
      send: (request: Request<Rpcs>) => Effect.Effect<any, E>,
      request: Request<Rpcs>
    ) => Effect.Effect<any, E>,
    span: Span | undefined,
    payload: any,
    headers: Headers.Headers,
    context: Context.Context<never>,
    discard: boolean
  ) =>
    Effect.withFiber<any, any, any>((parentFiber) => {
      if (isShutdown) {
        return Effect.interrupt
      }
      const id = generateRequestId()
      const send = middleware(
        (message) => options.onFromClient({ message, context }),
        {
          _tag: "Request",
          id,
          tag: rpc._tag as Rpc.Tag<Rpcs>,
          payload,
          ...(span ?
            {
              traceId: span.traceId,
              spanId: span.spanId,
              sampled: span.sampled
            } :
            {}),
          headers: Headers.merge(parentFiber.getRef(CurrentHeaders), headers),
          ...(discard ? { discard: true as const } : {})
        }
      )
      let fiber: Fiber.Fiber<any, any>
      return Effect.onInterrupt(
        Effect.callback<any, any>((resume) => {
          let acked = false
          const entry: ClientEntry = {
            _tag: "Effect",
            rpc,
            context,
            resume(exit) {
              if (discard && exit._tag === "Success") {
                // A successful acknowledgement waits for the send to finish, as
                // interrupting the send could cancel the call: an HTTP handler
                // is scoped to its request. Failures complete the call at once.
                acked = true
                if (fiber?.pollUnsafe()) resume(Exit.void)
                return
              }
              resume(exit)
              if (fiber && !fiber.pollUnsafe()) {
                parentFiber.currentDispatcher.scheduleTask(() => {
                  fiber.interruptUnsafe(parentFiber.id)
                }, 0)
              }
            }
          }
          entries.set(id, entry)
          fiber = send.pipe(
            span ? Effect.withParentSpan(span, { captureStackTrace: false }) : identity,
            Effect.runForkWith(parentFiber.context)
          )
          fiber.addObserver((exit) => {
            if (exit._tag === "Failure") {
              entries.delete(id)
              return resume(exit)
            } else if (acked) {
              return resume(Exit.void)
            }
          })
        }),
        (interruptors) => {
          entries.delete(id)
          return Effect.andThen(
            Fiber.interrupt(fiber),
            sendInterrupt(id, Array.from(interruptors), context)
          )
        }
      )
    })

  const onStreamRequest = Effect.fnUntraced(function*(
    rpc: Rpc.AnyWithProps,
    middleware: (
      send: (request: Request<Rpcs>) => Effect.Effect<any, E>,
      request: Request<Rpcs>
    ) => Effect.Effect<any, E>,
    payload: any,
    headers: Headers.Headers,
    streamBufferSize: number,
    context: Context.Context<never>
  ) {
    if (isShutdown) {
      return yield* Effect.interrupt
    }

    const span = disableTracing ? undefined : yield* Effect.makeSpanScoped(
      RpcTracing.spanName(spanPrefix, rpc._tag),
      { kind: "client", attributes: RpcTracing.spanAttributes(rpc._tag, options.spanAttributes) }
    )
    const fiber = Fiber.getCurrent()!
    const id = generateRequestId()

    const scope = Context.getUnsafe(fiber.context, Scope.Scope)
    const queue = yield* Queue.bounded<any, any>(streamBufferSize)
    yield* Scope.addFinalizerExit(
      scope,
      (exit) => {
        Queue.shutdownUnsafe(queue)
        if (!entries.has(id)) return Effect.void
        entries.delete(id)
        return sendInterrupt(
          id,
          Exit.isFailure(exit) ?
            Array.from(Cause.interruptors(exit.cause))
            : [],
          context
        )
      }
    )

    entries.set(id, {
      _tag: "Queue",
      rpc,
      queue,
      scope,
      context
    })

    yield* middleware(
      (message) => options.onFromClient({ message, context }),
      {
        _tag: "Request",
        id,
        tag: rpc._tag as Rpc.Tag<Rpcs>,
        payload,
        ...(span ?
          {
            traceId: span.traceId,
            spanId: span.spanId,
            sampled: span.sampled
          } :
          {}),
        headers: Headers.merge(fiber.getRef(CurrentHeaders), headers)
      }
    ).pipe(
      span ? Effect.withParentSpan(span, { captureStackTrace: false }) : identity,
      Effect.onError((cause) => {
        if (!Cause.hasInterruptsOnly(cause)) entries.delete(id)
        return Queue.failCause(queue, cause)
      }),
      Effect.interruptible,
      Effect.forkIn(scope, { startImmediately: true })
    )

    return queue
  })

  const getRpcClientMiddleware = (
    rpc: Rpc.AnyWithProps
  ): (
    send: (request: Request<Rpcs>) => Effect.Effect<any, E>,
    request: Request<Rpcs>
  ) => Effect.Effect<any, E> => {
    const middlewares: Array<RpcMiddleware.RpcMiddlewareClient<any, any, any>> = []
    for (const tag of rpc.middlewares.values()) {
      const middleware = Context.getOrUndefinedUnsafe(services, `${tag.key}/Client`) as any
      if (!middleware) continue
      middlewares.push(middleware)
    }

    if (middlewares.length === 0) {
      return (send, request) => send(request)
    }

    return function loop(
      send: (request: Request<Rpcs>) => Effect.Effect<any, E>,
      request: Request<Rpcs>,
      index = middlewares.length - 1
    ): Effect.Effect<any, E> {
      if (index === -1) {
        return send(request)
      }
      return middlewares[index]({
        rpc,
        request,
        next(request) {
          return loop(send, request, index - 1) as any
        }
      }) as Effect.Effect<any, E>
    }
  }

  const sendInterrupt = (
    requestId: RequestId,
    interruptors: ReadonlyArray<number>,
    context: Context.Context<never>
  ): Effect.Effect<void> =>
    Effect.callback<void>((resume) => {
      const parentFiber = Fiber.getCurrent()!
      const fiber = options.onFromClient({
        message: { _tag: "Interrupt", requestId, interruptors },
        context
      }).pipe(
        Effect.timeout(1000),
        Effect.runForkWith(parentFiber.context)
      )
      fiber.addObserver(() => {
        resume(Effect.void)
      })
    })

  const write = (message: FromServer<Rpcs>): Effect.Effect<void> => {
    switch (message._tag) {
      case "Chunk": {
        const requestId = message.requestId
        const entry = entries.get(requestId)
        if (!entry || entry._tag !== "Queue") return Effect.void
        return Queue.offerAll(entry.queue, message.values).pipe(
          supportsAck
            ? Effect.flatMap((dropped) =>
              // values are dropped when the queue was shutdown by an interrupted
              // consumer, so the server should not be asked for more
              dropped.length > 0 ? Effect.void : options.onFromClient({
                message: { _tag: "Ack", requestId: message.requestId },
                context: entry.context
              })
            )
            : identity,
          Effect.catchCause((cause) => Queue.failCause(entry.queue, cause))
        )
      }
      case "Exit": {
        const requestId = message.requestId
        const entry = entries.get(requestId)
        if (!entry) return Effect.void
        entries.delete(requestId)
        if (entry._tag === "Effect") {
          entry.resume(message.exit)
          return Effect.void
        }
        return message.exit._tag === "Success"
          ? Queue.end(entry.queue)
          : Queue.failCause(entry.queue, message.exit.cause)
      }
      case "Defect": {
        return clearEntries(Exit.die(message.defect))
      }
      case "ClientEnd": {
        return Effect.void
      }
    }
  }

  let client: any
  if (options.flatten) {
    const fns = new Map<string, any>()
    client = function client(tag: string, payload: any, options?: {}) {
      let fn = fns.get(tag)
      if (!fn) {
        fn = onRequest(group.requests.get(tag)! as any)
        fns.set(tag, fn)
      }
      return fn(payload, options)
    }
  } else {
    client = {}
    group.requests.forEach((rpc) => {
      InternalRecord.assignProperty(client, rpc._tag, onRequest(rpc as any))
    })
  }

  return { client, write } as const
})

let clientIdCounter = 0

/**
 * Creates a schema-aware RPC client for a group using the current client
 * `Protocol`, encoding requests and decoding server responses.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: <Rpcs extends Rpc.Any, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly flatten?: Flatten | undefined
  } | undefined
) => Effect.Effect<
  Flatten extends true ? RpcClient.Flat<Rpcs, RpcClientError> : RpcClient<Rpcs, RpcClientError>,
  never,
  Protocol | Rpc.MiddlewareClient<Rpcs> | Scope.Scope
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly flatten?: Flatten | undefined
  } | undefined
) {
  const clientId = clientIdCounter++
  const { codecFor, run, send, supportsAck, supportsTransferables } = yield* Protocol
  const rpcSchemas = makeRpcSchemas(codecFor)
  const decodeDefect = Schema.decodeSync(codecFor(Schema.Defect()))

  type ClientEntry = {
    readonly rpc: Rpc.AnyWithProps
    readonly context: Context.Context<never>
    readonly schemas: RpcSchemas
    readonly discard: boolean
  }
  const entries = new Map<RequestId, ClientEntry>()
  // Completed before the protocol stops running this client, so requests made
  // while it shuts down are not handed to a transport that is being torn down.
  const closing = Deferred.makeUnsafe<void>()

  const interruptRequest = (requestId: RequestId): Effect.Effect<void, RpcClientError> => {
    if (!entries.has(requestId)) return Effect.void
    entries.delete(requestId)
    return send(clientId, { _tag: "Interrupt", requestId }) as Effect.Effect<void, RpcClientError>
  }

  const { client, write } = yield* makeNoSerialization(group, {
    ...options,
    supportsAck,
    onFromClient({ message }) {
      switch (message._tag) {
        case "Request": {
          const rpc = group.requests.get(message.tag)! as any as Rpc.AnyWithProps
          const collector = supportsTransferables ? Transferable.makeCollectorUnsafe() : undefined

          const fiber = Fiber.getCurrent()!

          const entry: ClientEntry = {
            rpc,
            context: collector ? Context.add(fiber.context, Transferable.Collector, collector) : fiber.context,
            schemas: rpcSchemas(rpc),
            discard: message.discard === true
          }
          entries.set(message.id, entry)

          return entry.schemas.encodePayload(message.payload).pipe(
            Effect.provideContext(entry.context),
            Effect.orDie,
            Effect.flatMap((payload) => {
              // Checked after encoding, which can suspend while the client
              // starts shutting down.
              if (Deferred.isDoneUnsafe(closing)) {
                entries.delete(message.id)
                return Effect.interrupt
              }
              return send(clientId, {
                ...message,
                id: message.id,
                payload,
                headers: Object.entries(message.headers)
              }, collector && collector.readUnsafe())
            }),
            // An interrupted request keeps its entry until the interrupt is sent.
            Effect.onError((cause) =>
              Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.sync(() => entries.delete(message.id))
            )
          ) as Effect.Effect<void, RpcClientError>
        }
        case "Ack": {
          const entry = entries.get(message.requestId)
          if (!entry) return Effect.void
          return send(clientId, {
            _tag: "Ack",
            requestId: message.requestId
          }) as Effect.Effect<void, RpcClientError>
        }
        case "Interrupt": {
          return interruptRequest(message.requestId)
        }
        case "Eof": {
          return Effect.void
        }
      }
    }
  })

  yield* run(clientId, (message) => {
    switch (message._tag) {
      case "Chunk": {
        const requestId = RequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry || Option.isNone(entry.schemas.decodeChunk)) return Effect.void
        const decodeChunk = entry.schemas.decodeChunk.value
        return Effect.uninterruptibleMask((restore) =>
          restore(
            decodeChunk(message.values).pipe(
              Effect.provideContext(entry.context),
              Effect.orDie,
              Effect.flatMap((chunk) => write({ _tag: "Chunk", clientId: 0, requestId, values: chunk }))
            )
          ).pipe(
            Effect.onError((cause) =>
              write({ _tag: "Exit", clientId: 0, requestId, exit: Exit.failCause(cause) }).pipe(
                Effect.andThen(
                  Cause.hasInterrupts(cause) ? Effect.void : Effect.raceFirst(
                    Effect.ignore(interruptRequest(requestId)),
                    // Best-effort once the client closes: a disconnected transport
                    // can wait for a reconnect that never comes.
                    Deferred.await(closing)
                  )
                )
              )
            ),
            // a decode failure only ends its own request; interruption still propagates
            Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => Effect.void)
          )
        ) as Effect.Effect<void>
      }
      case "Exit": {
        const requestId = RequestId(message.requestId)
        const entry = entries.get(requestId)
        if (!entry) return Effect.void
        entries.delete(requestId)
        // the success of a discarded call is its acknowledgement, which has no
        // value, and an older server may send the handler result instead
        if (entry.discard && message.exit._tag === "Success") {
          return write({ _tag: "Exit", clientId: 0, requestId, exit: Exit.void as any })
        }
        const decodeExit = entry.discard ? entry.schemas.decodeDiscardExit : entry.schemas.decodeExit
        return decodeExit(message.exit).pipe(
          Effect.provideContext(entry.context),
          Effect.orDie,
          Effect.matchCauseEffect({
            onSuccess: (exit) => write({ _tag: "Exit", clientId: 0, requestId, exit }),
            onFailure: (cause) => write({ _tag: "Exit", clientId: 0, requestId, exit: Exit.failCause(cause) })
          })
        ) as Effect.Effect<void>
      }
      // Clear entries before resuming callers, as they can start new requests
      case "Defect": {
        entries.clear()
        return write({ _tag: "Defect", clientId: 0, defect: decodeDefect(message.defect as any) })
      }
      case "ClientProtocolError": {
        const exit = Exit.fail(message.error)
        const requestIds = message.requestIds === undefined
          ? Array.from(entries.keys())
          : message.requestIds.map(RequestId).filter((requestId) => entries.has(requestId))
        for (const requestId of requestIds) entries.delete(requestId)
        return Effect.forEach(
          requestIds,
          (requestId) => write({ _tag: "Exit", clientId: 0, requestId, exit: exit as any })
        ).pipe(Effect.uninterruptible)
      }
      default: {
        return Effect.void
      }
    }
  }).pipe(
    Effect.catchCause(Effect.logError),
    Effect.interruptible,
    Effect.forkScoped
  )
  // Finalizers run in reverse order, so this runs before `run` is interrupted.
  yield* Effect.addFinalizer(() => Deferred.succeed(closing, void 0))

  return client
})

interface RpcSchemas {
  readonly decodeChunk: Option.Option<
    (chunk: ReadonlyArray<unknown>) => Effect.Effect<NonEmptyReadonlyArray<any>, Schema.SchemaError, unknown>
  >
  readonly encodePayload: (payload: any) => Effect.Effect<any, Schema.SchemaError, unknown>
  readonly decodeExit: (encoded: unknown) => Effect.Effect<Exit.Exit<any, any>, Schema.SchemaError, unknown>
  readonly decodeDiscardExit: (encoded: unknown) => Effect.Effect<Exit.Exit<any, any>, Schema.SchemaError, unknown>
}
// Codecs are compiled per client, because two protocols can fill the message
// holes with different codecs.
const makeRpcSchemas = (codecFor: RpcSerialization.CodecFor) => {
  const cache = new WeakMap<Rpc.AnyWithProps, RpcSchemas>()
  return (rpc: Rpc.AnyWithProps): RpcSchemas => {
    let entry = cache.get(rpc)
    if (entry !== undefined) {
      return entry
    }
    const streamSchemas = RpcSchema.getStreamSchemas(rpc.successSchema)
    const parseOptions = Context.get(rpc.annotations, Rpc.ParseOptions)
    const exitSchema = Rpc.exitSchema(rpc as any)
    let decodeDiscardExit: RpcSchemas["decodeDiscardExit"] | undefined
    entry = {
      decodeChunk: Option.map(
        streamSchemas,
        (streamSchemas) =>
          Schema.decodeUnknownEffect(codecFor(Schema.NonEmptyArray(streamSchemas.success)), parseOptions)
      ),
      encodePayload: Schema.encodeEffect(codecFor(rpc.payloadSchema), parseOptions),
      decodeExit: Schema.decodeUnknownEffect(codecFor(exitSchema), parseOptions),
      // the server encodes the Exits of a discarded call with a void success
      decodeDiscardExit: (encoded) =>
        (decodeDiscardExit ??= Schema.decodeUnknownEffect(
          codecFor(Schema.Exit(Schema.Void, exitSchema.error, exitSchema.defect)),
          parseOptions
        ))(encoded)
    }
    cache.set(rpc, entry)
    return entry
  }
}

/**
 * Fiber reference containing headers that are merged into outgoing RPC
 * client requests.
 *
 * **When to use**
 *
 * Use to set request headers that should be automatically merged into outgoing
 * RPC client messages.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CurrentHeaders = Context.Reference<Headers.Headers>("effect/rpc/RpcClient/CurrentHeaders", {
  defaultValue: () => Headers.empty
})

/**
 * Runs an effect with additional RPC client headers, merging them with the
 * current `CurrentHeaders` value for outgoing requests.
 *
 * @stability unstable
 * @category headers
 * @since 4.0.0
 */
export const withHeaders: {
  (headers: Headers.Input): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, headers: Headers.Input): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, headers: Headers.Input): Effect.Effect<A, E, R> =>
    Effect.updateService(effect, CurrentHeaders, Headers.merge(Headers.fromInput(headers)))
)

/**
 * Defines the service interface for an RPC client transport, responsible for running the
 * receive loop and sending encoded client messages.
 *
 * **When to use**
 *
 * Use to provide the transport boundary for RPC clients over HTTP, WebSocket,
 * workers, sockets, or custom protocols.
 *
 * **Details**
 *
 * A `Request` that `send` accepts stays pending until a reply names its id: an
 * `Exit`, or a `ClientProtocolError` that lists it in `requestIds`. Until then
 * the client keeps the request and the caller's context, unless the caller is
 * interrupted, the client closes or the connection fails. A transport that
 * only delivers requests, such as a message queue, writes a void `Exit` for a
 * `discard` request once the request is delivered, and fails `send` with an
 * `RpcClientError` for any other request.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Protocol extends Context.Service<Protocol, {
  readonly run: (
    clientId: number,
    f: (data: FromServerEncoded) => Effect.Effect<void>
  ) => Effect.Effect<never>
  readonly send: (
    clientId: number,
    request: FromClientEncoded,
    transferables?: ReadonlyArray<globalThis.Transferable>
  ) => Effect.Effect<void, RpcClientError>
  readonly supportsAck: boolean
  readonly supportsTransferables: boolean
  /**
   * Builds the codec that fills the `unknown` holes of the protocol messages,
   * re-passed from the `RpcSerialization` backing this transport.
   */
  readonly codecFor: RpcSerialization.CodecFor
}>()("effect/rpc/RpcClient/Protocol") {
  /**
   * Creates a client protocol service from the supplied RPC request runner.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static make = withRunClient
}

/**
 * Creates a client `Protocol` that sends RPC requests through the supplied
 * `HttpClient` and decodes responses with the current `RpcSerialization`.
 *
 * **Details**
 *
 * Each request is sent as its own HTTP request unless `batch` is set. With
 * `batch`, the first request for a client opens a batch. Requests from the
 * same client made before `window` elapses join it, and the batch is sent once
 * the window elapses or it reaches `maxSize` requests, whichever comes first.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolHttp = (client: HttpClient.HttpClient, options?: {
  readonly batch?: {
    readonly window: Duration.Input
    readonly maxSize?: number | undefined
  } | undefined
}): Effect.Effect<
  Protocol["Service"],
  never,
  RpcSerialization.RpcSerialization
> => options?.batch ? makeProtocolHttpBatched(client, options.batch) : makeProtocolHttpUnbatched(client)

const makeProtocolHttpUnbatched = (client: HttpClient.HttpClient) =>
  Protocol.make(Effect.fnUntraced(function*(writeResponse) {
    const serialization = yield* RpcSerialization.RpcSerialization
    const exchange = makeHttpExchange(client, serialization, writeResponse)
    return {
      send: (clientId, request) =>
        request._tag === "Request"
          ? Effect.flatMap(exchange.send(clientId, [request]), (pending) => exchange.requestExit(request, pending))
          : Effect.void,
      supportsAck: false,
      supportsTransferables: false,
      codecFor: serialization.codecFor
    }
  }))

const makeProtocolHttpBatched = Effect.fnUntraced(function*(client: HttpClient.HttpClient, options: {
  readonly window: Duration.Input
  readonly maxSize?: number | undefined
}) {
  const { maxSize, window } = options

  // Batches of a client run in its own scope, which is closed when the client
  // stops running.
  const scopes = new Map<number, Scope.Closeable>()
  const closeScope = (clientId: number) => {
    const scope = scopes.get(clientId)
    if (scope === undefined) return Effect.void
    scopes.delete(clientId)
    return Scope.close(scope, Exit.void)
  }

  const protocol = yield* Protocol.make(Effect.fnUntraced(function*(writeResponse) {
    const serialization = yield* RpcSerialization.RpcSerialization
    const exchange = makeHttpExchange(client, serialization, writeResponse)

    interface Batch {
      readonly requests: Array<RequestEncoded>
      readonly full: Latch.Latch
      readonly done: Deferred.Deferred<ReadonlySet<string> | undefined, RpcClientError>
    }
    const batches = new Map<number, Batch>()
    const closeBatch = (clientId: number, batch: Batch) => {
      if (batches.get(clientId) === batch) {
        batches.delete(clientId)
      }
    }
    // Runs in the client scope rather than in a caller, so interrupting one
    // caller does not cancel the HTTP request for the rest of the batch.
    const runBatch = (clientId: number, batch: Batch) =>
      Effect.raceFirst(Effect.sleep(window), batch.full.await).pipe(
        Effect.andThen(Effect.suspend(() => {
          closeBatch(clientId, batch)
          return exchange.send(clientId, batch.requests)
        })),
        Effect.onExit((exit) => {
          closeBatch(clientId, batch)
          return Deferred.done(batch.done, exit)
        })
      )
    const send = Effect.fnUntraced(function*(clientId: number, request: RequestEncoded) {
      let batch = batches.get(clientId)
      if (batch === undefined) {
        batch = { requests: [request], full: Latch.makeUnsafe(), done: Deferred.makeUnsafe() }
        batches.set(clientId, batch)
        let scope = scopes.get(clientId)
        if (scope === undefined) {
          scope = Scope.makeUnsafe()
          scopes.set(clientId, scope)
        }
        yield* Effect.forkIn(runBatch(clientId, batch), scope, { startImmediately: true })
      } else {
        batch.requests.push(request)
      }
      if (batch.requests.length === maxSize) {
        closeBatch(clientId, batch)
        batch.full.openUnsafe()
      }
      return yield* exchange.requestExit(request, yield* Deferred.await(batch.done))
    })

    return {
      send: (clientId, request) => request._tag === "Request" ? send(clientId, request) : Effect.void,
      supportsAck: false,
      supportsTransferables: false,
      codecFor: serialization.codecFor
    }
  }))

  return Protocol.of({
    ...protocol,
    run: (clientId, f) => Effect.onExit(protocol.run(clientId, f), () => closeScope(clientId))
  })
})

// Sends RPC requests in one HTTP request, shared by the batched and unbatched
// HTTP protocols.
const makeHttpExchange = (
  client: HttpClient.HttpClient,
  serialization: RpcSerialization.RpcSerialization["Service"],
  writeResponse: (clientId: number, response: FromServerEncoded) => Effect.Effect<void>
) => {
  const isFramed = serialization.includesFraming
  const httpClientError = (cause: any) =>
    new RpcClientError({
      reason: HttpClientErrorSchema.fromHttpClientError(cause)
    })
  const protocolDefect = (message: string, cause: unknown) =>
    new RpcClientError({
      reason: new RpcClientDefect({ message, cause })
    })

  // Writes each response as it is decoded. Returns the ids of the requests left
  // without a terminal response, or `undefined` when the server sent no
  // responses.
  const send = Effect.fnUntraced(function*(
    clientId: number,
    requests: ReadonlyArray<RequestEncoded>
  ) {
    const parser = serialization.makeUnsafe()

    const encoded = parser.encode(requests.length === 1 ? requests[0] : requests)!
    const body = typeof encoded === "string" ?
      HttpBody.text(encoded, serialization.contentType) :
      HttpBody.uint8Array(encoded, serialization.contentType)

    const response = yield* client.post("", { body }).pipe(Effect.mapError(httpClientError))

    const pending = new Set<string>()
    for (let i = 0; i < requests.length; i++) {
      pending.add(String(requests[i].id))
    }
    const onResponse = (response: FromServerEncoded) => {
      if (response._tag === "Exit") {
        pending.delete(String(response.requestId))
      } else if (isTerminalResponse(response)) {
        // defects and protocol errors end every request of the client
        pending.clear()
      }
      return writeResponse(clientId, response)
    }

    if (!isFramed) {
      const text = yield* response.text.pipe(Effect.mapError(httpClientError))
      const responses = yield* Effect.try({
        try: () => parser.decode(text),
        catch: (cause) => protocolDefect("Error decoding HTTP response", cause)
      })
      if (!Array.isArray(responses)) {
        return yield* protocolDefect("Expected an array of responses", responses)
      }
      if (responses.length === 0) {
        return undefined
      }
      for (let i = 0; i < responses.length; i++) {
        yield* onResponse(responses[i])
      }
      return pending
    }

    let hasResponse = false
    yield* Stream.runForEachArray(response.stream, (chunk) =>
      Effect.try({
        try: () => chunk.flatMap(parser.decode) as Array<FromServerEncoded>,
        catch: (cause) => protocolDefect("Error decoding HTTP response", cause)
      }).pipe(
        Effect.flatMap((responses) => {
          if (responses.length === 0) return Effect.void
          hasResponse = true
          let i = 0
          return Effect.whileLoop({
            while: () => i < responses.length,
            body: () => onResponse(responses[i++]),
            step: constVoid
          })
        })
      )).pipe(
        Effect.mapError((cause) => isRpcClientError(cause) ? cause : httpClientError(cause))
      )
    return hasResponse ? pending : undefined
  })

  // Completes one request from the result of the exchange that carried it.
  const requestExit = (
    request: RequestEncoded,
    pending: ReadonlySet<string> | undefined
  ): Exit.Exit<void, RpcClientError> => {
    if (pending === undefined) {
      return Exit.fail(protocolDefect("Received empty HTTP response from RPC server", request))
    } else if (pending.has(String(request.id))) {
      return Exit.fail(protocolDefect("HTTP response ended before RPC request completed", request))
    }
    return Exit.void
  }

  return { send, requestExit } as const
}

/**
 * Provides a client `Protocol` backed by `HttpClient`, targeting the configured
 * URL and optionally transforming the client before use.
 *
 * **Details**
 *
 * Set `batch` to send concurrent requests from the same client in a single
 * HTTP request. The first request for a client opens a batch. Requests from
 * the same client made before `window` elapses join it, and the batch is sent
 * once the window elapses or it reaches `maxSize` requests, whichever comes
 * first.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolHttp = (options: {
  readonly url: string
  readonly transformClient?: <E, R>(client: HttpClient.HttpClient.With<E, R>) => HttpClient.HttpClient.With<E, R>
  readonly batch?: {
    readonly window: Duration.Input
    readonly maxSize?: number | undefined
  } | undefined
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpClient.HttpClient> =>
  Layer.effect(Protocol)(
    Effect.flatMap(
      HttpClient.HttpClient,
      (client) => {
        client = HttpClient.mapRequest(client, HttpClientRequest.prependUrl(options.url))
        return makeProtocolHttp(options.transformClient ? options.transformClient(client) : client, {
          batch: options.batch
        })
      }
    )
  )

/**
 * Creates a client `Protocol` over the current `Socket`, using the current
 * `RpcSerialization`, connection hooks, ping timeouts, and the configured retry
 * policy.
 *
 * **Details**
 *
 * `pingInterval` defaults to 5 seconds. `pingTimeout` defaults to the interval
 * and measures time since the last decoded server frame, not the last pong.
 * The timeout is checked on each ping tick; any decoded frame counts as liveness.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolSocket = (options?: {
  readonly pingInterval?: Duration.Input | undefined
  readonly pingTimeout?: Duration.Input | undefined
  readonly retryTransientErrors?: boolean | undefined
  readonly retryPolicy?: Schedule.Schedule<any, Socket.SocketError> | undefined
  /**
   * Runs for each retried `SocketOpenError` when `retryTransientErrors` is enabled.
   * A ping timeout fails in-flight calls and is reported through `onPingTimeout`
   * instead. The returned `Effect<void>` cannot fail with a typed error or
   * require services; defects are logged and ignored so retries can continue.
   */
  readonly onTransientError?: ((error: RpcClientError) => Effect.Effect<void>) | undefined
  /**
   * Runs when an open connection is dropped because no server frame arrived
   * within `pingTimeout`, before `ConnectionHooks.onDisconnect` and before
   * in-flight calls fail with a `SocketReadError`. Defects are logged and ignored.
   *
   * @since 4.0.3
   */
  readonly onPingTimeout?: Effect.Effect<void> | undefined
}): Effect.Effect<
  Protocol["Service"],
  never,
  Scope.Scope | RpcSerialization.RpcSerialization | Socket.Socket
> =>
  Protocol.make(Effect.fnUntraced(function*(writeResponse, clientIds) {
    const socket = yield* Socket.Socket
    const serialization = yield* RpcSerialization.RpcSerialization
    const hooks = yield* Effect.serviceOption(ConnectionHooks)
    const requestClientMap = new Map<string | number, number>()

    const writer = yield* socket.writer

    let parser = serialization.makeUnsafe()

    // Encode each ping with the current connection's parser.
    const pinger = yield* makePinger(Effect.suspend(() => writer.write(parser.encode(constPing)!)), options)
    const onPingTimeout = Effect.ignoreCause(options?.onPingTimeout ?? Effect.void, {
      log: true,
      message: "RpcClient onPingTimeout hook failed"
    })
    let currentError: RpcClientError | undefined

    const broadcast = (response: FromServerEncoded) => {
      const deliver = Effect.forEach(Array.from(clientIds), (clientId) => writeResponse(clientId, response))
      if (response._tag !== "Defect" && response._tag !== "ClientProtocolError") return deliver
      // A terminal response ends every request; clear routing before callers can start new ones
      requestClientMap.clear()
      return Effect.uninterruptible(deliver)
    }
    const broadcastError = (error: RpcClientError) => {
      currentError = error
      return broadcast({
        _tag: "ClientProtocolError",
        error
      })
    }

    const processData = (data: Uint8Array | string): Effect.Effect<void> => {
      try {
        const responses = parser.decode(data) as Array<FromServerEncoded>
        if (responses.length === 0) return Effect.void
        pinger.onFrame()
        let i = 0
        return Effect.whileLoop({
          while: () => i < responses.length,
          body: () => {
            const response = responses[i++]
            if (response._tag === "Pong") return Effect.void
            if (Object.hasOwn(response, "requestId")) {
              const requestId = (response as FromServerEncoded & { readonly requestId: string | number }).requestId
              const clientId = requestClientMap.get(requestId)
              if (clientId !== undefined) {
                if (response._tag === "Exit") {
                  requestClientMap.delete(requestId)
                }
                return writeResponse(clientId, response)
              }
            }
            return broadcast(response)
          },
          step: constVoid
        })
      } catch (defect) {
        return broadcast({
          _tag: "ClientProtocolError",
          error: new RpcClientError({
            reason: new RpcClientDefect({
              message: "Error decoding message",
              cause: defect
            })
          })
        })
      }
    }

    yield* Effect.suspend(() => {
      parser = serialization.makeUnsafe()
      pinger.reset()
      let connected = false
      return Effect.gen(function*() {
        const { pull } = yield* socket.reader
        currentError = undefined
        connected = true
        if (Option.isSome(hooks)) {
          yield* hooks.value.onConnect
        }
        while (true) {
          const frames = yield* pull
          for (let i = 0; i < frames.length; i++) {
            yield* processData(frames[i])
          }
        }
      }).pipe(
        Effect.scoped,
        // The read loop never succeeds, so the race only succeeds on a ping
        // timeout, after the socket has been cleaned up.
        Effect.raceFirst(pinger.timeout),
        Effect.andThen(() => connected ? onPingTimeout : Effect.void),
        Effect.andThen(() =>
          Effect.fail(
            new Socket.SocketError({
              reason: new Socket.SocketReadError({
                cause: new Error("ping timeout")
              })
            })
          )
        )
      )
    }).pipe(
      Option.isSome(hooks) ? Effect.ensuring(hooks.value.onDisconnect) : identity,
      Effect.tapCause((cause) => {
        const error = Cause.findError(cause)
        const hasError = Result.isSuccess(error)
        const rpcError = new RpcClientError({
          reason: hasError ? error.success.reason : new RpcClientDefect({
            message: "Unknown socket error",
            cause: Cause.squash(cause)
          })
        })
        if (
          options?.retryTransientErrors && hasError &&
          error.success.reason._tag === "SocketOpenError"
        ) {
          return (options.onTransientError?.(rpcError) ?? Effect.void).pipe(
            Effect.ignoreCause({
              log: true,
              message: "RpcClient onTransientError hook failed"
            })
          )
        }
        return broadcastError(rpcError)
      }),
      Effect.retryOrElse(
        options?.retryPolicy ?? defaultRetryPolicy,
        (error) => broadcastError(new RpcClientError({ reason: error.reason }))
      ),
      Effect.annotateLogs({
        module: "RpcClient",
        method: "makeProtocolSocket"
      }),
      Effect.forkScoped
    )

    const write = (request: FromClientEncoded) =>
      Effect.suspend(() => {
        const encoded = parser.encode(request)
        return encoded === undefined ? Effect.void : Effect.orDie(writer.write(encoded))
      })

    return {
      send(clientId, request) {
        if (currentError) {
          return Effect.fail(currentError)
        }
        if (request._tag === "Interrupt") requestClientMap.delete(request.requestId)
        if (request._tag !== "Request") return write(request)
        requestClientMap.set(request.id, clientId)
        return Effect.onError(write(request), () => Effect.sync(() => requestClientMap.delete(request.id)))
      },
      supportsAck: true,
      supportsTransferables: false,
      codecFor: serialization.codecFor
    }
  }))

const defaultRetryPolicy = Schedule.min([
  Schedule.exponential(500, 1.5),
  Schedule.spaced(5000)
])

const makePinger = Effect.fnUntraced(function*<A, E, R>(writePing: Effect.Effect<A, E, R>, options?: {
  readonly pingInterval?: Duration.Input | undefined
  readonly pingTimeout?: Duration.Input | undefined
}) {
  const clock = yield* Clock.Clock
  const interval = options?.pingInterval ?? "5 seconds"
  const timeoutMillis = Duration.toMillis(options?.pingTimeout ?? interval)
  let lastSeen = clock.currentTimeMillisUnsafe()
  let awaitingResponse = false
  const latch = Latch.makeUnsafe()
  const onFrame = () => {
    lastSeen = clock.currentTimeMillisUnsafe()
    awaitingResponse = false
  }
  const reset = () => {
    onFrame()
    latch.closeUnsafe()
  }
  yield* Effect.suspend((): Effect.Effect<void, E, R> => {
    // A late tick must send a ping before it can declare the connection silent.
    // Keep the timeout measured from the last frame, including for custom timeouts.
    if (awaitingResponse && clock.currentTimeMillisUnsafe() - lastSeen > timeoutMillis) return latch.open
    awaitingResponse = true
    return writePing
  }).pipe(
    Effect.delay(interval),
    Effect.ignore,
    Effect.forever,
    Effect.interruptible,
    Effect.forkScoped
  )
  return { timeout: latch.await, reset, onFrame } as const
})

/**
 * Provides a client `Protocol` backed by the current `Socket` and
 * `RpcSerialization` services.
 *
 * **Details**
 *
 * `pingInterval` defaults to 5 seconds. `pingTimeout` defaults to the interval
 * and measures time since the last decoded server frame, not the last pong.
 * The timeout is checked on each ping tick; any decoded frame counts as liveness.
 * `retryPolicy` configures retries after socket errors.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolSocket = (options?: {
  readonly pingInterval?: Duration.Input | undefined
  readonly pingTimeout?: Duration.Input | undefined
  readonly retryTransientErrors?: boolean | undefined
  readonly retryPolicy?: Schedule.Schedule<any, Socket.SocketError> | undefined
  /**
   * Runs for each retried `SocketOpenError` when `retryTransientErrors` is enabled.
   * A ping timeout fails in-flight calls and is reported through `onPingTimeout`
   * instead. The returned `Effect<void>` cannot fail with a typed error or
   * require services; defects are logged and ignored so retries can continue.
   */
  readonly onTransientError?: ((error: RpcClientError) => Effect.Effect<void>) | undefined
  /**
   * Runs when an open connection is dropped because no server frame arrived
   * within `pingTimeout`, before `ConnectionHooks.onDisconnect` and before
   * in-flight calls fail with a `SocketReadError`. Defects are logged and ignored.
   *
   * @since 4.0.3
   */
  readonly onPingTimeout?: Effect.Effect<void> | undefined
}): Layer.Layer<
  Protocol,
  never,
  Socket.Socket | RpcSerialization.RpcSerialization
> => Layer.effect(Protocol)(makeProtocolSocket(options))

/**
 * Creates a client `Protocol` backed by a pool of workers, routing RPC requests
 * to workers and supporting transferable values when the platform does.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const makeProtocolWorker = (
  options: {
    readonly size: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
  } | {
    readonly minSize: number
    readonly maxSize: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
    readonly timeToLive: Duration.Input
  }
): Effect.Effect<
  Protocol["Service"],
  WorkerError,
  Scope.Scope | Worker.WorkerPlatform | Worker.Spawner
> =>
  Protocol.make(Effect.fnUntraced(function*(writeResponse, clientIds) {
    const worker = yield* Worker.WorkerPlatform
    const scope = yield* Effect.scope
    let workerId = 0
    const initialMessage = yield* Effect.serviceOption(RpcWorker.InitialMessage)
    const hooks = yield* Effect.serviceOption(ConnectionHooks)

    const entries = new Map<string | number, {
      readonly clientId: number
      readonly worker: Worker.Worker<FromServerEncoded, FromClientEncoded | RpcWorker.InitialMessage.Encoded>
      readonly latch: Latch.Latch
    }>()

    const broadcast = (response: FromServerEncoded) =>
      Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response))

    const acquire = Effect.gen(function*() {
      const id = workerId++
      const backing = yield* worker.spawn<FromServerEncoded, FromClientEncoded | RpcWorker.InitialMessage.Encoded>(id)

      yield* backing.run((response) => {
        if (response._tag === "Exit") {
          const entry = entries.get(response.requestId)
          if (entry) {
            entries.delete(response.requestId)
            entry.latch.openUnsafe()
            return writeResponse(entry.clientId, response)
          }
        } else if (response._tag === "Defect") {
          for (const [requestId, entry] of entries) {
            entries.delete(requestId)
            entry.latch.openUnsafe()
          }
          return broadcast(response)
        } else if ("requestId" in response) {
          const entry = entries.get(response.requestId)
          if (entry) {
            return writeResponse(entry.clientId, response)
          }
        }
        return broadcast(response)
      }, {
        onSpawn: Option.isSome(initialMessage) ?
          Effect.flatMap(
            initialMessage.value,
            ([value, transfers]) => Effect.orDie(backing.send({ _tag: "InitialMessage", value }, transfers))
          ) :
          undefined
      }).pipe(
        Effect.tapCause((cause) => {
          const requestIdsByClient = new Map<number, Array<string | number>>()
          for (const [requestId, entry] of entries) {
            if (entry.worker !== backing) continue
            entries.delete(requestId)
            entry.latch.openUnsafe()
            const requestIds = requestIdsByClient.get(entry.clientId)
            if (requestIds) requestIds.push(requestId)
            else requestIdsByClient.set(entry.clientId, [requestId])
          }
          const found = Cause.findError(cause)
          const error = new RpcClientError({
            reason: Result.isSuccess(found) ? found.success.reason : new RpcClientDefect({
              message: "Error in worker",
              cause: Cause.squash(cause)
            })
          })
          return Effect.forEach(
            requestIdsByClient,
            ([clientId, requestIds]) => writeResponse(clientId, { _tag: "ClientProtocolError", error, requestIds })
          )
        }),
        Effect.retry(Schedule.spaced(1000)),
        Effect.annotateLogs({
          module: "RpcClient",
          method: "makeProtocolWorker"
        }),
        Effect.interruptible,
        Effect.forkScoped
      )

      return backing
    })

    const pool = "minSize" in options ?
      yield* Pool.makeWithTTL({
        acquire,
        min: options.minSize,
        max: options.maxSize,
        concurrency: options.concurrency,
        targetUtilization: options.targetUtilization,
        timeToLive: options.timeToLive
      }) :
      yield* Pool.make({
        acquire,
        size: options.size,
        concurrency: options.concurrency,
        targetUtilization: options.targetUtilization
      })

    yield* Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        for (const entry of entries.values()) {
          entry.latch.openUnsafe()
        }
        entries.clear()
      })
    )

    const send = (
      clientId: number,
      request: FromClientEncoded,
      transferables?: ReadonlyArray<globalThis.Transferable>
    ) => {
      switch (request._tag) {
        case "Request": {
          return Pool.get(pool).pipe(
            Effect.flatMap((worker) => {
              const latch = Latch.makeUnsafe(false)
              entries.set(request.id, { clientId, worker, latch })
              // the pool counts a worker as busy until the Exit arrives, so a
              // discarded call is sent without its marker to get the handler Exit
              let message = request
              if (request.discard === true) {
                const { discard: _, ...rest } = request
                message = rest
              }
              return Effect.flatMap(worker.send(message, transferables), () => latch.await)
            }),
            Effect.scoped,
            Effect.orDie
          )
        }
        case "Interrupt": {
          const entry = entries.get(request.requestId)
          if (!entry) return Effect.void
          entries.delete(request.requestId)
          entry.latch.openUnsafe()
          return Effect.orDie(entry.worker.send(request))
        }
        case "Ack": {
          const entry = entries.get(request.requestId)
          if (!entry) return Effect.void
          return Effect.orDie(entry.worker.send(request))
        }
      }
      return Effect.void
    }

    yield* Effect.scoped(Pool.get(pool))
    if (Option.isSome(hooks)) yield* hooks.value.onConnect

    return {
      send,
      supportsAck: true,
      supportsTransferables: true,
      // Worker protocols use structured clone, so they do not depend on
      // `RpcSerialization`. A binary worker protocol is a separate protocol.
      codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
    }
  }))

/**
 * Provides a client `Protocol` backed by a worker pool using the current worker
 * platform and spawner services.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerProtocolWorker: (
  options: {
    readonly size: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
  } | {
    readonly minSize: number
    readonly maxSize: number
    readonly concurrency?: number | undefined
    readonly targetUtilization?: number | undefined
    readonly timeToLive: Duration.Input
  }
) => Layer.Layer<
  Protocol,
  WorkerError,
  Worker.WorkerPlatform | Worker.Spawner
> = flow(makeProtocolWorker, Layer.effect(Protocol))

/**
 * Represents optional client protocol hooks that run when a transport connects
 * and disconnects.
 *
 * **When to use**
 *
 * Use to run setup or cleanup effects when an RPC client transport opens or
 * closes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ConnectionHooks extends Context.Service<ConnectionHooks, {
  readonly onConnect: Effect.Effect<void>
  readonly onDisconnect: Effect.Effect<void>
}>()("effect/rpc/RpcClient/ConnectionHooks") {}
