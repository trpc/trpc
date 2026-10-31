import { NodeHttpServer, NodeSocket } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
import { FetchHttpClient, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import type * as NetAddress from "effect/net/NetAddress"

const Viewer = GraphQL.query("Viewer", {
  document: "query Viewer{viewer{login}}",
  result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
})

const IssueUpdated = GraphQL.subscription("IssueUpdated", {
  document: "subscription IssueUpdated($id:ID!){issueUpdated(id:$id){title}}",
  variables: { id: Schema.String },
  result: Schema.Struct({ issueUpdated: Schema.Struct({ title: Schema.String }) })
})

const Group = GraphQLGroup.make(Viewer, IssueUpdated)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const viewer = { data: { viewer: { login: "tim" } } }
const issue = (title: string) => ({ data: { issueUpdated: { title } } })

/**
 * POST answers queries with JSON and subscriptions with a graphql-sse stream.
 */
const post = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  if (!(request.headers["accept"] ?? "").includes("text/event-stream")) {
    return yield* HttpServerResponse.json(viewer)
  }
  return HttpServerResponse.stream(
    Stream.make(
      `event: next\ndata: ${JSON.stringify(issue("over sse"))}\n\n`,
      "event: complete\ndata:\n\n"
    ).pipe(Stream.map((chunk) => encoder.encode(chunk))),
    { contentType: "text/event-stream" }
  )
})

/**
 * A hand-rolled graphql-transport-ws server that requires an Authorization
 * header on the handshake.
 */
const webSocket = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  if (request.headers["authorization"] !== "Bearer secret") {
    return HttpServerResponse.empty({ status: 401 })
  }
  const socket = yield* request.upgrade
  const { write } = yield* socket.writer
  const { pull } = yield* socket.reader
  const send = (message: unknown) => write(JSON.stringify(message))
  while (true) {
    for (const frame of yield* pull) {
      const message = JSON.parse(typeof frame === "string" ? frame : decoder.decode(frame))
      switch (message.type) {
        case "connection_init":
          yield* send({ type: "connection_ack" })
          break
        case "ping":
          yield* send({ type: "pong" })
          break
        case "subscribe":
          yield* send({ id: message.id, type: "next", payload: issue("over ws") })
          yield* send({ id: message.id, type: "complete" })
          break
      }
    }
  }
}).pipe(
  Effect.scoped,
  Effect.catchTag("SocketError", () => Effect.succeed(HttpServerResponse.empty()))
)

describe("GraphQLProtocol over a real server", () => {
  it.effect(
    "serves a query over POST, a subscription over graphql-ws and one over graphql-sse",
    () =>
      Effect.gen(function*() {
        yield* HttpRouter.add("POST", "/graphql", post).pipe(
          Layer.merge(HttpRouter.add("GET", "/graphql", webSocket)),
          (layer) => HttpRouter.serve(layer, { disableListenLog: true }),
          Layer.build
        )
        const server = yield* HttpServer.HttpServer
        const port = (server.address as NetAddress.InetAddress).port
        const url = `http://127.0.0.1:${port}/graphql`

        const splitProtocol = yield* Layer.build(GraphQLProtocol.layerHttp({
          url,
          subscriptions: {
            webSocket: { url: `ws://127.0.0.1:${port}/graphql`, headers: { authorization: "Bearer secret" } }
          }
        }))
        const split = yield* GraphQLClient.make(Group).pipe(Effect.provide(splitProtocol))
        assert.deepStrictEqual(yield* split.Viewer(), viewer.data)
        assert.deepStrictEqual(
          yield* Stream.runCollect(split.IssueUpdated({ id: "I_1" })),
          [issue("over ws").data]
        )

        const sseProtocol = yield* Layer.build(GraphQLProtocol.layerHttp({ url }))
        const sse = yield* GraphQLClient.make(Group).pipe(Effect.provide(sseProtocol))
        assert.deepStrictEqual(
          yield* Stream.runCollect(sse.IssueUpdated({ id: "I_1" })),
          [issue("over sse").data]
        )
      }).pipe(
        Effect.provide([FetchHttpClient.layer, NodeSocket.layerWebSocketConstructor]),
        Effect.provide(NodeHttpServer.layerTest),
        Effect.timeout("5 seconds")
      ),
    10000
  )
})
