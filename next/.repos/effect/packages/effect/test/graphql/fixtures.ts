/**
 * Shared fixtures for the `effect/graphql` runtime tests.
 *
 * The operations below stand in for what `@effect/graphql-generator` emits for a
 * GitHub-style schema, including a custom scalar codec (`DateTime`).
 */
import { assert } from "@effect/vitest"
import { Deferred, Effect, Layer, Queue, Ref, Schema, Stream } from "effect"
import { GraphQL, GraphQLGroup } from "effect/graphql"
import { GraphQLClientError } from "effect/graphql/GraphQLClientError"
import * as GraphQLProtocol from "effect/graphql/GraphQLProtocol"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Socket from "effect/socket/Socket"

// -----------------------------------------------------------------------------
// Stand-in for generated output
// -----------------------------------------------------------------------------

const Issue = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  createdAt: Schema.DateTimeUtcFromString
})

export const RepoIssues = GraphQL.query("RepoIssues", {
  document:
    "query RepoIssues($owner:String!,$name:String!,$after:String,$since:DateTime){repository(owner:$owner,name:$name){issues(first:2,after:$after,filterBy:{since:$since}){pageInfo{hasNextPage endCursor}nodes{number title createdAt}}}}",
  variables: {
    owner: Schema.String,
    name: Schema.String,
    after: Schema.optional(Schema.NullOr(Schema.String)),
    since: Schema.optional(Schema.NullOr(Schema.DateTimeUtcFromString))
  },
  result: Schema.Struct({
    repository: Schema.NullOr(Schema.Struct({
      issues: Schema.NullOr(Schema.Struct({
        pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean, endCursor: Schema.NullOr(Schema.String) }),
        nodes: Schema.NullOr(Schema.Array(Schema.NullOr(Issue)))
      }))
    }))
  })
})

export const Viewer = GraphQL.query("Viewer", {
  document: "query Viewer{viewer{login}}",
  result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
})

export const IssueUpdated = GraphQL.subscription("IssueUpdated", {
  document: "subscription IssueUpdated($id:ID!){issueUpdated(id:$id){title}}",
  variables: { id: Schema.String },
  result: Schema.Struct({ issueUpdated: Schema.Struct({ title: Schema.String }) })
})

export const IssuesGroup = GraphQLGroup.make(RepoIssues, IssueUpdated)
export const ViewerGroup = GraphQLGroup.make(Viewer)

// -----------------------------------------------------------------------------
// Transport doubles
// -----------------------------------------------------------------------------

/**
 * A `GraphQLProtocol` layer with scripted behaviour. Tests that exercise the
 * client (middleware, partial results, paging, subscriptions) use this instead
 * of HTTP so they stay about the client.
 */
export const protocolLayer = (service: {
  readonly execute?: GraphQLProtocol.GraphQLProtocol["Service"]["execute"]
  readonly subscribe?: GraphQLProtocol.GraphQLProtocol["Service"]["subscribe"]
}) =>
  Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
    execute: service.execute ?? (() => Effect.die("execute not scripted")),
    subscribe: service.subscribe ?? (() => Stream.die("subscribe not scripted"))
  })

/**
 * A protocol whose `execute` always answers with the same raw body, and HTTP
 * `status` when given, and records every request it received.
 */
export const executeLayer = Effect.fnUntraced(function*(body: unknown, status?: number) {
  const requests = yield* Ref.make<Array<GraphQLProtocol.GraphQLRequest>>([])
  const layer = protocolLayer({
    execute: (request) =>
      Effect.as(
        Ref.update(requests, (all) => [...all, request]),
        status === undefined ? { body } : { body, status }
      )
  })
  return { layer, requests }
})

/**
 * An `HttpClient` that answers every request from `handler`, with the request
 * body text and the final URL exposed so tests can assert on what went over
 * the wire.
 */
export const httpClientLayer = (
  handler: (request: HttpClientRequest.HttpClientRequest, bodyText: string | undefined, url: URL) => Response
) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() =>
        HttpClientResponse.fromWeb(
          request,
          handler(request, request.body instanceof HttpBody.Uint8Array ? request.body.text : undefined, url)
        )
      )
    )
  )

export const graphqlResponse = (body: unknown, init?: { status?: number; contentType?: string }) =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": init?.contentType ?? "application/graphql-response+json" }
  })

export const layerHttp = (
  handler: (request: HttpClientRequest.HttpClientRequest, bodyText: string | undefined, url: URL) => Response
) => GraphQLProtocol.layerHttp({ url: "http://localhost/graphql" }).pipe(Layer.provide(httpClientLayer(handler)))

/**
 * A graphql-ws message as it goes over the wire.
 */
export interface WsMessage {
  readonly type: string
  readonly id?: string | undefined
  readonly payload?: unknown
}

/**
 * The server end of one in-memory WebSocket opened by the transport.
 */
interface WsConnection {
  readonly url: string
  readonly options: Socket.WebSocketConstructorOptions | undefined
  /** Every frame the client sent, parsed. */
  readonly received: Queue.Queue<WsMessage>
  /** The code the client closed with, once it does. */
  readonly closed: Deferred.Deferred<number>
  readonly send: (message: WsMessage) => Effect.Effect<void>
  readonly close: (code: number, reason?: string) => Effect.Effect<void>
}

/**
 * A `Socket.WebSocketConstructor` whose sockets are in-memory queue pairs.
 * Each socket the transport opens shows up on `connections`, already open,
 * for the test to script the server side.
 */
export const wsServer = Effect.gen(function*() {
  const connections = yield* Queue.unbounded<WsConnection>()
  const layer = Layer.succeed(
    Socket.WebSocketConstructor,
    (url, options) => {
      const inbox = Effect.runSync(Queue.unbounded<WsMessage>())
      const closedWith = Effect.runSync(Deferred.make<number>())
      let listeners: Array<{
        readonly type: string
        readonly listener: (event: Socket.WebSocketEvent) => void
        readonly once: boolean
      }> = []
      const dispatch = (type: string, event: Socket.WebSocketEvent) => {
        for (const entry of listeners.filter((entry) => entry.type === type)) {
          if (entry.once) listeners = listeners.filter((other) => other !== entry)
          entry.listener(event)
        }
      }
      const ws = {
        readyState: 1,
        addEventListener(type, listener, options) {
          listeners.push({ type, listener, once: options?.once === true })
        },
        removeEventListener(type, listener) {
          listeners = listeners.filter((entry) => entry.type !== type || entry.listener !== listener)
        },
        send(data) {
          Queue.offerUnsafe(inbox, JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)))
        },
        close(code = 1005, reason) {
          if (ws.readyState >= 2) return
          ws.readyState = 3
          Deferred.doneUnsafe(closedWith, Effect.succeed(code))
          dispatch("close", { code, reason: reason ?? "" })
        }
      } satisfies Socket.WebSocketLike & { readyState: number }
      Queue.offerUnsafe(connections, {
        url,
        options,
        received: inbox,
        closed: closedWith,
        send: (message) => Effect.sync(() => dispatch("message", { data: JSON.stringify(message) })),
        close: (code, reason) =>
          Effect.sync(() => {
            if (ws.readyState >= 2) return
            ws.readyState = 3
            dispatch("close", { code, reason: reason ?? "" })
          })
      })
      return ws
    }
  )
  /**
   * Takes the next connection, reads its `connection_init` and acknowledges it.
   */
  const accept = Effect.gen(function*() {
    const connection = yield* Queue.take(connections)
    const init = yield* Queue.take(connection.received)
    assert.strictEqual(init.type, "connection_init")
    yield* connection.send({ type: "connection_ack" })
    return { connection, init }
  })
  return { layer, connections, accept }
})

// -----------------------------------------------------------------------------
// Assertions
// -----------------------------------------------------------------------------

/**
 * Runs `effect`, asserts it fails with a `GraphQLClientError` whose reason has
 * `tag`, and returns that reason narrowed.
 */
export const expectReason =
  <Tag extends GraphQLClientError["reason"]["_tag"]>(tag: Tag) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.map(Effect.flip(effect), (error) => {
      assert.instanceOf(error, GraphQLClientError)
      assert.strictEqual(error.reason._tag, tag)
      return error.reason as Extract<GraphQLClientError["reason"], { _tag: Tag }>
    })
