import { assert } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import { readMcpHttpResponse } from "./McpHttpResponse.ts"

export const MCP_ENDPOINT = "http://localhost/mcp"

export const makeHttpHarness = Effect.fnUntraced(function*<A, E>(
  serverLayer: Layer.Layer<A, E, HttpRouter.HttpRouter>,
  options?: {
    readonly routerLayer?: Layer.Layer<never, never, HttpRouter.HttpRouter> | undefined
  }
) {
  const appLayer = options?.routerLayer ? Layer.merge(serverLayer, options.routerLayer) : serverLayer
  const { dispose, handler } = HttpRouter.toWebHandler(appLayer, { disableLogger: true })
  yield* Effect.addFinalizer(() => Effect.promise(() => dispose()))
  const responses: Array<Response> = []
  let sessionId: string | null = null
  let protocolVersion: string | null = null

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (sessionId !== null) {
      request.headers.set("Mcp-Session-Id", sessionId)
    }
    if (protocolVersion !== null && !request.headers.has("Mcp-Protocol-Version")) {
      request.headers.set("Mcp-Protocol-Version", protocolVersion)
    }
    const response = await handler(request)
    sessionId = response.headers.get("Mcp-Session-Id") ?? sessionId
    protocolVersion = response.headers.get("Mcp-Protocol-Version") ?? protocolVersion
    responses.push(response.clone())
    return response
  }
  const fetch: typeof globalThis.fetch = Object.assign(fetchImpl, { preconnect() {} })

  const postText = (body: string, headers?: HeadersInit) =>
    Effect.promise(() =>
      handler(
        new Request(MCP_ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            ...headers
          },
          body
        })
      )
    )

  const post = (body: unknown, headers?: HeadersInit) => postText(JSON.stringify(body), headers)

  return {
    handler,
    fetch,
    post,
    postText,
    responses
  } as const
})

export const initializeHttpSession = Effect.fnUntraced(function*(
  harness: Effect.Success<ReturnType<typeof makeHttpHarness>>,
  selectedProtocol: McpProtocol.ProtocolAdapter
) {
  const response = yield* harness.post({
    jsonrpc: "2.0",
    id: "initialize",
    method: "initialize",
    params: {
      protocolVersion: selectedProtocol.protocolVersion,
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" }
    }
  })
  yield* readMcpHttpResponse(response)
  const sessionId = response.headers.get("Mcp-Session-Id")
  assert.isNotNull(sessionId)
  const headers = { "Mcp-Session-Id": sessionId, "Mcp-Protocol-Version": selectedProtocol.protocolVersion }
  yield* harness.post({ jsonrpc: "2.0", method: "notifications/initialized" }, headers)
  return headers
})
