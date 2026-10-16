import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { readMcpHttpResponse } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { makeFeaturesServerLayer, type Observations } from "./McpConformanceFixtures.ts"
import { makeMcpTestPeer, type McpTestPeerOptions } from "./McpTestPeer.ts"

const SERVER_NAME = "McpConformance"
const SERVER_VERSION = "1.0.0"

const InitializeResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Number,
  result: McpSchema.InitializeResult
})

const ErrorResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
  error: McpSchema.McpError
})

const ResultResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Number]),
  result: Schema.Record(Schema.String, Schema.Unknown)
})

const BatchResponse = Schema.Array(Schema.Struct({
  id: Schema.Number,
  result: Schema.Struct({})
}))

const StatelessDiscoverResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Number,
  result: Schema.Struct({
    capabilities: McpSchema.ServerCapabilities,
    instructions: Schema.optional(Schema.String)
  })
})

const decodeInitializeResponse = Schema.decodeUnknownEffect(InitializeResponse)
const decodeErrorResponse = Schema.decodeUnknownEffect(ErrorResponse)
const decodeResultResponse = Schema.decodeUnknownEffect(ResultResponse)
const decodeBatchResponse = Schema.decodeUnknownEffect(BatchResponse)

const statelessBody = (
  protocol: McpProtocol.ProtocolAdapter,
  body: unknown,
  clientCapabilities?: Record<string, unknown>
): unknown => {
  if (
    protocol.runtime._tag !== "Stateless" ||
    typeof body !== "object" ||
    body === null ||
    !("method" in body)
  ) {
    return body
  }
  const message = body as { readonly params?: unknown }
  const params = typeof message.params === "object" && message.params !== null
    ? message.params as Record<string, unknown>
    : {}
  const metadata = typeof params._meta === "object" && params._meta !== null && !Array.isArray(params._meta)
    ? params._meta as Record<string, unknown>
    : {}
  return {
    ...body,
    params: {
      ...params,
      _meta: {
        ...metadata,
        "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
        "io.modelcontextprotocol/clientCapabilities": clientCapabilities ?? {
          elicitation: { form: {} },
          roots: {},
          sampling: {}
        },
        "io.modelcontextprotocol/clientInfo": { name: "McpConformanceClient", version: "1.0.0" }
      }
    }
  }
}

const statelessHeaders = (protocol: McpProtocol.ProtocolAdapter, body: unknown): HeadersInit => {
  if (
    protocol.runtime._tag !== "Stateless" ||
    typeof body !== "object" ||
    body === null ||
    !("method" in body) ||
    typeof body.method !== "string"
  ) {
    return {}
  }
  const params = "params" in body && typeof body.params === "object" && body.params !== null
    ? body.params as Record<string, unknown>
    : {}
  const name = body.method === "resources/read"
    ? params.uri
    : body.method === "tools/call" || body.method === "prompts/get"
    ? params.name
    : undefined
  return {
    "MCP-Protocol-Version": protocol.protocolVersion,
    "Mcp-Method": body.method,
    ...(typeof name === "string" ? { "Mcp-Name": name } : {})
  }
}

export interface InitializedSession {
  readonly response: Response
  readonly message: typeof InitializeResponse.Type
  readonly sessionId: string | null
  readonly server: "default" | "features"
}

export interface InitializeOptions {
  readonly id?: number | undefined
  readonly protocolVersion?: string | undefined
  readonly server?: "default" | "features" | undefined
}

export interface SendOptions {
  readonly includeProtocolVersion?: boolean | undefined
  readonly protocolVersion?: string | undefined
  readonly clientCapabilities?: Record<string, unknown> | undefined
  readonly headers?: HeadersInit | undefined
}

export interface McpConformanceShape {
  readonly protocol: McpProtocol.ProtocolAdapter
  readonly serverInfo: {
    readonly name: string
    readonly version: string
  }
  readonly initializeRequest: (options?: Omit<InitializeOptions, "server">) => {
    readonly jsonrpc: "2.0"
    readonly id: number
    readonly method: "initialize"
    readonly params: {
      readonly protocolVersion: string
      readonly capabilities: {}
      readonly clientInfo: {
        readonly name: string
        readonly version: string
      }
    }
  }
  readonly initializedNotification: {
    readonly jsonrpc: "2.0"
    readonly method: "notifications/initialized"
  }
  readonly pingRequest: (id?: number) => {
    readonly jsonrpc: "2.0"
    readonly id: number
    readonly method: "ping"
    readonly params: {}
  }
  readonly post: (body: unknown, headers?: HeadersInit) => Effect.Effect<Response>
  readonly request: (request: Request) => Effect.Effect<Response>
  readonly initialize: (
    options?: InitializeOptions
  ) => Effect.Effect<InitializedSession, Schema.SchemaError>
  readonly send: (
    session: InitializedSession,
    body: unknown,
    options?: SendOptions
  ) => Effect.Effect<Response>
  readonly sendText: (
    session: InitializedSession,
    body: string,
    options?: SendOptions
  ) => Effect.Effect<Response>
  readonly notifyInitialized: (
    session: InitializedSession,
    options?: SendOptions
  ) => Effect.Effect<Response>
  readonly ping: (
    session: InitializedSession,
    options?: SendOptions & { readonly id?: number | undefined }
  ) => Effect.Effect<Response>
  readonly makePeer: (
    options?: McpTestPeerOptions
  ) => ReturnType<typeof makeMcpTestPeer>
  readonly observations: Effect.Effect<Observations>
  readonly requestCount: Effect.Effect<number>
  readonly resetObservations: Effect.Effect<void>
  readonly decodeError: (response: Response) => Effect.Effect<typeof ErrorResponse.Type, Schema.SchemaError>
  readonly decodeResult: (response: Response) => Effect.Effect<typeof ResultResponse.Type, Schema.SchemaError>
  readonly decodeBatchResponseIds: (
    response: Response
  ) => Effect.Effect<ReadonlyArray<number>, Schema.SchemaError>
}

export class McpConformance extends Context.Service<McpConformance, McpConformanceShape>()(
  "effect/test/unstable/ai/McpConformance"
) {}

export type McpConformanceLayer = Layer.Layer<McpConformance, unknown>

export const layer = (protocol: McpProtocol.ProtocolAdapter) =>
  Layer.effect(
    McpConformance,
    Effect.gen(function*() {
      const defaultHarness = yield* makeHttpHarness(makeServerLayer({
        name: SERVER_NAME,
        protocols: [protocol]
      }))
      const observations = yield* Ref.make<Observations>({
        toolInvocations: 0,
        promptInvocations: 0,
        resourceTemplateInvocations: 0
      })
      const requestCount = yield* Ref.make(0)
      const featuresHarness = yield* makeHttpHarness(makeFeaturesServerLayer(protocol, observations))
      const post = (
        harness: typeof defaultHarness,
        body: unknown,
        headers?: HeadersInit
      ) => Ref.update(requestCount, (count) => count + 1).pipe(Effect.andThen(harness.post(body, headers)))
      const postText = (
        harness: typeof defaultHarness,
        body: string,
        headers?: HeadersInit
      ) => Ref.update(requestCount, (count) => count + 1).pipe(Effect.andThen(harness.postText(body, headers)))

      const initializeRequest: McpConformanceShape["initializeRequest"] = (options) => ({
        jsonrpc: "2.0",
        id: options?.id ?? 1,
        method: "initialize",
        params: {
          protocolVersion: options?.protocolVersion ?? protocol.protocolVersion,
          capabilities: {},
          clientInfo: {
            name: "McpConformanceClient",
            version: "1.0.0"
          }
        }
      })

      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      } as const

      const pingRequest: McpConformanceShape["pingRequest"] = (id = 2) => ({
        jsonrpc: "2.0",
        id,
        method: "ping",
        params: {}
      })

      const initialize: McpConformanceShape["initialize"] = Effect.fnUntraced(function*(options) {
        const server = options?.server ?? "default"
        const harness = server === "features" ? featuresHarness : defaultHarness
        if (protocol.runtime._tag === "Stateless") {
          const request = statelessBody(protocol, {
            jsonrpc: "2.0",
            id: options?.id ?? 1,
            method: "server/discover",
            params: {}
          })
          const response = yield* post(harness, request, statelessHeaders(protocol, request))
          const decoded = yield* Effect.promise<unknown>(() => response.json()).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(StatelessDiscoverResponse))
          )
          return {
            response,
            message: {
              jsonrpc: "2.0",
              id: options?.id ?? 1,
              result: {
                protocolVersion: protocol.protocolVersion,
                capabilities: decoded.result.capabilities,
                instructions: decoded.result.instructions,
                serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
              }
            },
            sessionId: null,
            server
          }
        }
        const response = yield* post(harness, initializeRequest(options))
        const body = yield* readMcpHttpResponse(response)
        return {
          response,
          message: yield* decodeInitializeResponse(body),
          sessionId: response.headers.get("Mcp-Session-Id"),
          server
        }
      })

      const sessionHeaders = (session: InitializedSession, options?: SendOptions): HeadersInit => ({
        ...(session.sessionId === null ? {} : { "Mcp-Session-Id": session.sessionId }),
        ...(options?.includeProtocolVersion ?? true
          ? {
            "Mcp-Protocol-Version": options?.protocolVersion ?? session.message.result.protocolVersion
          }
          : {}),
        ...options?.headers
      })

      const harnessFor = (session: InitializedSession) =>
        session.server === "features" ? featuresHarness : defaultHarness

      const sendText: McpConformanceShape["sendText"] = (session, body, options) =>
        postText(harnessFor(session), body, sessionHeaders(session, options))

      const send: McpConformanceShape["send"] = (session, body, options) => {
        if (protocol.runtime._tag !== "Stateless") {
          return post(harnessFor(session), body, sessionHeaders(session, options))
        }
        const request = statelessBody(protocol, body, options?.clientCapabilities)
        return post(harnessFor(session), request, {
          ...statelessHeaders(protocol, request),
          ...options?.headers
        })
      }

      const notifyInitialized: McpConformanceShape["notifyInitialized"] = (session, options) =>
        protocol.runtime._tag === "Stateless"
          ? Effect.succeed(new Response(null, { status: 202 }))
          : send(session, initializedNotification, options)

      const ping: McpConformanceShape["ping"] = (session, options) => send(session, pingRequest(options?.id), options)

      return McpConformance.of({
        protocol,
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        },
        initializeRequest,
        initializedNotification,
        pingRequest,
        post: (body, headers) => post(defaultHarness, body, headers),
        request: (request) => Effect.promise(() => defaultHarness.handler(request)),
        initialize,
        send,
        sendText,
        notifyInitialized,
        ping,
        makePeer: (options) => makeMcpTestPeer(protocol, options),
        observations: Ref.get(observations),
        requestCount: Ref.get(requestCount),
        resetObservations: Ref.set(observations, {
          toolInvocations: 0,
          promptInvocations: 0,
          resourceTemplateInvocations: 0
        }),
        decodeError: (response) =>
          readMcpHttpResponse(response).pipe(
            Effect.flatMap(decodeErrorResponse)
          ),
        decodeResult: (response) =>
          readMcpHttpResponse(response).pipe(
            Effect.flatMap(decodeResultResponse)
          ),
        decodeBatchResponseIds: (response) =>
          readMcpHttpResponse(response).pipe(
            Effect.flatMap(decodeBatchResponse),
            Effect.map((responses) => responses.map((message) => message.id))
          )
      })
    })
  )
