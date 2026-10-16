import type * as McpProtocol from "effect/ai/McpProtocol"
import type * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import type * as Arr from "effect/Array"
import type * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Sink from "effect/Sink"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"

export interface JsonRpcMessage {
  readonly jsonrpc: "2.0"
  readonly id?: string | number | null | undefined
  readonly method?: string | undefined
  readonly params?: unknown
  readonly result?: unknown
  readonly error?: unknown
}

export interface McpStdioRequestHandle {
  readonly id: string | number
  readonly response: Effect.Effect<JsonRpcMessage>
  readonly cancel: (reason?: string) => Effect.Effect<void>
}

export interface McpStdioHarness {
  readonly server: McpServer.McpServer["Service"]
  readonly serverFiber: Fiber.Fiber<never, Cause.IllegalArgumentError>
  readonly close: Effect.Effect<void>
  readonly sendRaw: (message: unknown) => Effect.Effect<void>
  readonly sendChunk: (chunk: string | Uint8Array) => Effect.Effect<void>
  readonly sendRequest: (
    method: string,
    params?: unknown,
    id?: string | number
  ) => Effect.Effect<JsonRpcMessage>
  readonly startRequest: (
    method: string,
    params?: unknown,
    id?: string | number
  ) => Effect.Effect<McpStdioRequestHandle>
  readonly sendNotification: (method: string, params?: unknown) => Effect.Effect<void>
  readonly initialize: (
    capabilities?: typeof McpSchema.ClientCapabilities.Type
  ) => Effect.Effect<JsonRpcMessage>
  readonly takeMessage: Effect.Effect<JsonRpcMessage>
  readonly takeFrame: Effect.Effect<unknown>
  readonly takeRawStdout: Effect.Effect<string>
  readonly takeStderr: Effect.Effect<string>
  readonly awaitOutboundMethod: (method: string) => Effect.Effect<JsonRpcMessage>
  readonly flushListChanged: Effect.Effect<void>
  readonly respond: (id: string | number, result: unknown) => Effect.Effect<void>
}

const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  typeof value === "object" && value !== null && (value as JsonRpcMessage).jsonrpc === "2.0"

const isResponse = (
  message: JsonRpcMessage
): message is JsonRpcMessage & { readonly id: string | number } =>
  (typeof message.id === "string" || typeof message.id === "number") &&
  message.method === undefined

const requestKey = (id: string | number) => `${typeof id}:${id}`

export const makeMcpStdioHarness = Effect.fnUntraced(function*<A>(
  protocol: McpProtocol.ProtocolAdapter,
  protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter> = [protocol],
  registrations?: Layer.Layer<A, never, McpServer.McpServer>
) {
  const stdin = yield* Queue.unbounded<Uint8Array, Cause.Done>()
  const stdout = yield* Queue.unbounded<string | Uint8Array>()
  const stderr = yield* Queue.unbounded<string | Uint8Array>()
  const frames = yield* Queue.unbounded<unknown>()
  const messages = yield* Queue.unbounded<JsonRpcMessage>()
  const rawStdout = yield* Queue.unbounded<string>()
  const rawStderr = yield* Queue.unbounded<string>()
  const responseQueues = new Map<string, Queue.Queue<JsonRpcMessage>>()
  const retainedMessages: Array<JsonRpcMessage> = []
  const encoder = new TextEncoder()
  const stdoutDecoder = new TextDecoder()
  const stderrDecoder = new TextDecoder()
  let nextRequestId = 1

  const stdioLayer = Stdio.layerTest({
    stdin: Stream.fromQueue(stdin),
    stdout: () => Sink.forEach((chunk) => Queue.offer(stdout, chunk)),
    stderr: () => Sink.forEach((chunk) => Queue.offer(stderr, chunk))
  })
  const ready = yield* Deferred.make<McpServer.McpServer["Service"]>()
  const serverFiber = yield* Effect.gen(function*() {
    const serverLayer = McpServer.layerStdio({
      name: "McpConformance",
      version: "1.0.0",
      protocols
    }).pipe(Layer.provide(stdioLayer))
    const context = yield* Layer.build(
      registrations === undefined
        ? serverLayer
        : registrations.pipe(Layer.provideMerge(serverLayer))
    )
    yield* Deferred.succeed(ready, Context.get(context, McpServer.McpServer))
    return yield* Effect.never
  }).pipe(Effect.scoped, Effect.forkScoped)
  const server = yield* Deferred.await(ready)

  const routeFrame = Effect.fnUntraced(function*(frame: unknown) {
    yield* Queue.offer(frames, frame)
    if (!isJsonRpcMessage(frame)) {
      return
    }
    if (isResponse(frame)) {
      const responseQueue = responseQueues.get(requestKey(frame.id))
      if (responseQueue !== undefined) {
        yield* Queue.offer(responseQueue, frame)
        return
      }
    }
    yield* Queue.offer(messages, frame)
  })

  yield* Effect.gen(function*() {
    let pending = ""
    while (true) {
      const chunk = yield* Queue.take(stdout)
      const text = typeof chunk === "string"
        ? chunk
        : stdoutDecoder.decode(chunk, { stream: true })
      yield* Queue.offer(rawStdout, text)
      pending += text
      let newline = pending.indexOf("\n")
      while (newline !== -1) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        if (line.length > 0) {
          yield* routeFrame(JSON.parse(line))
        }
        newline = pending.indexOf("\n")
      }
    }
  }).pipe(Effect.forkScoped)

  yield* Effect.gen(function*() {
    while (true) {
      const chunk = yield* Queue.take(stderr)
      yield* Queue.offer(
        rawStderr,
        typeof chunk === "string" ? chunk : stderrDecoder.decode(chunk, { stream: true })
      )
    }
  }).pipe(Effect.forkScoped)

  const sendChunk = (chunk: string | Uint8Array) =>
    Queue.offer(stdin, typeof chunk === "string" ? encoder.encode(chunk) : chunk)
  const sendRaw = (message: unknown) => sendChunk(`${JSON.stringify(message)}\n`)
  const requestMetadata = {
    "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "stdio-client", version: "1.0.0" }
  }
  const withRequestMetadata = (params: unknown) =>
    protocol.runtime._tag === "Stateless"
      ? {
        ...(typeof params === "object" && params !== null ? params : {}),
        _meta: {
          ...requestMetadata,
          ...(typeof params === "object" && params !== null && "_meta" in params &&
              typeof params._meta === "object" && params._meta !== null
            ? params._meta
            : {})
        }
      }
      : params
  const sendNotification = (method: string, params?: unknown) =>
    sendRaw({
      jsonrpc: "2.0",
      method,
      ...(params === undefined && protocol.runtime._tag !== "Stateless"
        ? {}
        : { params: withRequestMetadata(params) })
    })
  const startRequest = Effect.fnUntraced(function*(
    method: string,
    params?: unknown,
    id: string | number = nextRequestId++
  ) {
    const responseQueue = yield* Queue.unbounded<JsonRpcMessage>()
    const key = requestKey(id)
    responseQueues.set(key, responseQueue)
    yield* sendRaw({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined && protocol.runtime._tag !== "Stateless"
        ? {}
        : { params: withRequestMetadata(params) })
    })
    return {
      id,
      response: Queue.take(responseQueue).pipe(
        Effect.ensuring(Effect.sync(() => responseQueues.delete(key)))
      ),
      cancel: (reason?: string) =>
        sendNotification("notifications/cancelled", {
          requestId: id,
          ...(reason === undefined ? {} : { reason })
        })
    }
  })
  const sendRequest = Effect.fnUntraced(function*(
    method: string,
    params?: unknown,
    id?: string | number
  ) {
    const request = yield* startRequest(method, params, id)
    return yield* request.response
  })
  const takeMessage = Effect.suspend(() => {
    const retained = retainedMessages.shift()
    return retained === undefined ? Queue.take(messages) : Effect.succeed(retained)
  })
  const awaitOutboundMethod = Effect.fnUntraced(function*(method: string) {
    const retainedIndex = retainedMessages.findIndex((message) => message.method === method)
    if (retainedIndex !== -1) {
      return retainedMessages.splice(retainedIndex, 1)[0]!
    }
    while (true) {
      const message = yield* Queue.take(messages)
      if (message.method === method) {
        return message
      }
      retainedMessages.push(message)
    }
  })

  return {
    server,
    serverFiber,
    close: Queue.end(stdin),
    sendRaw,
    sendChunk,
    sendRequest,
    startRequest,
    sendNotification,
    initialize: Effect.fnUntraced(function*(capabilities = {}) {
      if (protocol.runtime._tag === "Stateless") {
        return yield* sendRequest("server/discover", {
          _meta: {
            ...requestMetadata,
            "io.modelcontextprotocol/clientCapabilities": capabilities
          }
        })
      }
      const response = yield* sendRequest("initialize", {
        protocolVersion: protocol.protocolVersion,
        capabilities,
        clientInfo: { name: "stdio-client", version: "1.0.0" }
      })
      yield* sendNotification("notifications/initialized")
      return response
    }),
    takeMessage,
    takeFrame: Queue.take(frames),
    takeRawStdout: Queue.take(rawStdout),
    takeStderr: Queue.take(rawStderr),
    awaitOutboundMethod,
    flushListChanged: Effect.yieldNow,
    respond: (id, result) => sendRaw({ jsonrpc: "2.0", id, result })
  } satisfies McpStdioHarness
})
