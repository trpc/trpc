import { assert, describe, it } from "@effect/vitest"
import { Context, Duration, Effect, Layer, Schema, Stream } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLMiddleware, GraphQLProtocol } from "effect/graphql"
import * as Headers from "effect/http/Headers"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import {
  expectReason,
  graphqlResponse,
  httpClientLayer,
  IssueUpdated,
  layerHttp,
  RepoIssues,
  Viewer,
  ViewerGroup
} from "./fixtures.ts"

const viewerData = { data: { viewer: { login: "tim" } } }

const AddStar = GraphQL.mutation("AddStar", {
  document: "mutation AddStar{addStar{ok}}",
  result: Schema.Struct({ addStar: Schema.Struct({ ok: Schema.Boolean }) })
})

const GitHubHost = Context.Reference<string>("test/GitHubHost", { defaultValue: () => "api.github.com" })

/** Every value of every URL param, so a duplicated or missing param shows. */
const urlParams = (url: URL) =>
  Object.fromEntries([...new Set(url.searchParams.keys())].map((key) => [key, url.searchParams.getAll(key)]))

const callViewer = (handler: Parameters<typeof layerHttp>[0]) =>
  GraphQLClient.make(ViewerGroup).pipe(
    Effect.flatMap((client) => client.Viewer()),
    Effect.provide(layerHttp(handler))
  )

const unavailable = (retryAfter: string) =>
  new Response("down", { status: 503, headers: { "retry-after": retryAfter, "content-type": "text/plain" } })

describe("GraphQLProtocol.layerHttp", () => {
  it.effect("POSTs the document, operation name and variables as JSON with per-call headers and URL params", () =>
    Effect.gen(function*() {
      let seen: { method: string; headers: Record<string, string>; body: unknown; url: URL } | undefined
      const result = yield* GraphQLClient.make(ViewerGroup).pipe(
        Effect.flatMap((client) =>
          client.Viewer(undefined, { headers: { "x-request-id": "abc" }, urlParams: { preview: "t" } })
        ),
        Effect.provide(layerHttp((request, bodyText, url) => {
          seen = { method: request.method, headers: request.headers, body: JSON.parse(bodyText!), url }
          return graphqlResponse(viewerData)
        }))
      )
      assert.deepStrictEqual(result, { viewer: { login: "tim" } })
      assert.strictEqual(seen!.method, "POST")
      assert.deepStrictEqual(urlParams(seen!.url), { preview: ["t"] })
      assert.strictEqual(seen!.headers["x-request-id"], "abc")
      assert.include(seen!.headers["accept"], "application/graphql-response+json")
      assert.deepStrictEqual(seen!.body, { query: Viewer.document, operationName: "Viewer", variables: {} })
    }))

  it.effect("queryMethod GET sends a query as URL params over the URL's and caller's; a mutation is still POSTed", () =>
    Effect.gen(function*() {
      const seen: Array<{ method: string; accept: string | undefined; bodyText: string | undefined; url: URL }> = []
      const layer = GraphQLProtocol.layerHttp({
        url: "http://localhost/graphql?tenant=a&query=stale&operationName=Stale",
        queryMethod: "GET"
      }).pipe(
        Layer.provide(httpClientLayer((request, bodyText, url) => {
          seen.push({ method: request.method, accept: request.headers["accept"], bodyText, url })
          return graphqlResponse(
            request.method === "GET" ? { data: { repository: null } } : { data: { addStar: { ok: true } } }
          )
        }))
      )
      const client = yield* GraphQLClient.make(GraphQLGroup.make(RepoIssues, AddStar)).pipe(Effect.provide(layer))
      const variables = { owner: "Effect-TS", name: "effect" }
      yield* client.RepoIssues(variables, { urlParams: { preview: "t", query: "ignored" } })
      yield* client.AddStar()

      const [query, mutation] = seen
      assert.strictEqual(query.method, "GET")
      assert.isUndefined(query.bodyText)
      assert.include(query.accept, "application/graphql-response+json")
      assert.deepStrictEqual(urlParams(query.url), {
        tenant: ["a"],
        preview: ["t"],
        query: [RepoIssues.document],
        operationName: ["RepoIssues"],
        variables: [JSON.stringify(variables)]
      })
      assert.strictEqual(mutation.method, "POST")
      assert.strictEqual(JSON.parse(mutation.bodyText!).operationName, "AddStar")
    }))

  it.effect("a url function routes queries, mutations and graphql-sse subscriptions by context and operation", () =>
    Effect.gen(function*() {
      const seen: Array<string> = []
      const layer = GraphQLProtocol.layerHttp({
        url: ({ context, kind, operationName }) =>
          `http://${Context.get(context, GitHubHost)}/graphql?route=${kind}.${operationName}`,
        queryMethod: "GET"
      }).pipe(
        Layer.provide(httpClientLayer((request, _, url) => {
          seen.push(`${request.method} ${url.host} ${urlParams(url).route}`)
          return request.headers["accept"] === "text/event-stream"
            ? new Response("event: complete\ndata:\n\n", { headers: { "content-type": "text/event-stream" } })
            : graphqlResponse(request.method === "GET" ? viewerData : { data: { addStar: { ok: true } } })
        }))
      )
      const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer, AddStar, IssueUpdated)).pipe(
        Effect.provide(layer)
      )

      yield* client.Viewer()
      yield* client.Viewer().pipe(Effect.provideService(GitHubHost, "api.acme.ghe.com"))
      yield* client.AddStar(undefined, { context: Context.make(GitHubHost, "ghes.example.com") })
      yield* client.IssueUpdated({ id: "I_1" }).pipe(
        Stream.runDrain,
        Effect.provideService(GitHubHost, "api.acme.ghe.com")
      )

      assert.deepStrictEqual(seen, [
        "GET api.github.com query.Viewer",
        "GET api.acme.ghe.com query.Viewer",
        "POST ghes.example.com mutation.AddStar",
        "POST api.acme.ghe.com subscription.IssueUpdated"
      ])
    }))

  it.effect("an Effect url is resolved asynchronously in the context of each query, mutation and subscription", () =>
    Effect.gen(function*() {
      const seen: Array<string> = []
      const layer = GraphQLProtocol.layerHttp({
        url: Effect.gen(function*() {
          yield* Effect.promise(() => Promise.resolve())
          return `http://${yield* GitHubHost}/graphql`
        })
      }).pipe(
        Layer.provide(httpClientLayer((request, bodyText, url) => {
          seen.push(`${url.host} ${JSON.parse(bodyText!).operationName}`)
          return request.headers["accept"] === "text/event-stream"
            ? new Response("event: complete\ndata:\n\n", { headers: { "content-type": "text/event-stream" } })
            : graphqlResponse({ data: { viewer: { login: "tim" }, addStar: { ok: true } } })
        }))
      )
      const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer, AddStar, IssueUpdated)).pipe(
        Effect.provide(layer)
      )

      yield* client.Viewer()
      yield* client.Viewer().pipe(Effect.provideService(GitHubHost, "api.acme.ghe.com"))
      yield* client.AddStar(undefined, { context: Context.make(GitHubHost, "ghes.example.com") })
      yield* client.IssueUpdated({ id: "I_1" }).pipe(
        Stream.runDrain,
        Effect.provideService(GitHubHost, "api.acme.ghe.com")
      )

      assert.deepStrictEqual(seen, [
        "api.github.com Viewer",
        "api.acme.ghe.com Viewer",
        "ghes.example.com AddStar",
        "api.acme.ghe.com IssueUpdated"
      ])
    }))

  it.effect("accepts an application/json body with GraphQL keys, matching the media type case-insensitively", () =>
    Effect.gen(function*() {
      for (const contentType of ["application/json", "Application/JSON; charset=utf-8"]) {
        const result = yield* callViewer(() => graphqlResponse(viewerData, { contentType }))
        assert.deepStrictEqual(result, { viewer: { login: "tim" } })
      }
    }))

  it.effect("a 200 application/json body without data or errors is a DecodeError", () =>
    Effect.gen(function*() {
      yield* callViewer(() => graphqlResponse({ ok: true }, { contentType: "application/json" })).pipe(
        expectReason("DecodeError")
      )
    }))

  for (const [status, isRetryable] of [[502, true], [400, false]] as const) {
    it.effect(`a ${status} with a GraphQL body is a ResponseError with isRetryable: ${isRetryable}`, () =>
      Effect.gen(function*() {
        const reason = yield* callViewer(() =>
          graphqlResponse({ data: null, errors: [{ message: "Query failed" }] }, { status })
        ).pipe(expectReason("ResponseError"))
        assert.deepStrictEqual(reason.errors, [{ message: "Query failed" }])
        assert.strictEqual(reason.status, status)
        assert.strictEqual(reason.isRetryable, isRetryable)
      }))
  }

  for (const contentType of ["application/json", "application/graphql-response+json"]) {
    it.effect(`a ${contentType} 503 with data and no errors is a TransportError, not a result`, () =>
      Effect.gen(function*() {
        const reason = yield* callViewer(() => graphqlResponse(viewerData, { status: 503, contentType })).pipe(
          expectReason("TransportError")
        )
        assert.strictEqual(reason.status, 503)
        assert.deepStrictEqual(reason.headers, Headers.fromInput({ "content-type": contentType }))
        assert.isTrue(reason.isRetryable)
      }))
  }

  it.effect("a 503 with data: null and no errors is a TransportError carrying its Retry-After", () =>
    Effect.gen(function*() {
      const reason = yield* callViewer(() =>
        new Response(JSON.stringify({ data: null }), {
          status: 503,
          headers: { "content-type": "application/graphql-response+json", "retry-after": "30" }
        })
      ).pipe(expectReason("TransportError"))
      assert.strictEqual(reason.status, 503)
      assert.deepStrictEqual(reason.retryAfter, Duration.seconds(30))
    }))

  it.effect("a 500 with data and errors is a ResponseError even with partial: true", () =>
    Effect.gen(function*() {
      const reason = yield* GraphQLClient.make(ViewerGroup).pipe(
        Effect.flatMap((client) => client.Viewer(undefined, { partial: true })),
        Effect.provide(layerHttp(() =>
          graphqlResponse({ ...viewerData, errors: [{ message: "boom", path: ["viewer"] }] }, { status: 500 })
        )),
        expectReason("ResponseError")
      )
      assert.strictEqual(reason.status, 500)
      assert.isTrue(reason.isRetryable)
    }))

  it.effect("a 429 with a GraphQL body is a ResponseError carrying a numeric Retry-After", () =>
    Effect.gen(function*() {
      const reason = yield* callViewer(() =>
        new Response(JSON.stringify({ data: null, errors: [{ message: "Rate limited" }] }), {
          status: 429,
          headers: { "content-type": "application/graphql-response+json", "retry-after": "30" }
        })
      ).pipe(expectReason("ResponseError"))
      assert.strictEqual(reason.status, 429)
      assert.deepStrictEqual(reason.retryAfter, Duration.seconds(30))
      assert.isTrue(reason.isRetryable)
    }))

  it.effect("HTTP response headers reach middleware through next and ResponseError", () =>
    Effect.gen(function*() {
      class RateLimit extends GraphQLMiddleware.Service<RateLimit>()("test/RateLimit") {}
      let seen: GraphQLProtocol.ExecutionResult | undefined
      const headers = { "content-type": "application/graphql-response+json", "x-ratelimit-remaining": "0" }
      const body = JSON.stringify({ errors: [{ message: "Rate limited", extensions: { code: "RATE_LIMITED" } }] })
      const reason = yield* GraphQLClient.make(ViewerGroup.middleware(RateLimit)).pipe(
        Effect.flatMap((client) => client.Viewer()),
        Effect.provide([
          layerHttp(() => new Response(body, { headers })),
          Layer.succeed(RateLimit, {
            execute: ({ next, request }) => Effect.tap(next(request), (result) => Effect.sync(() => seen = result)),
            subscribe: ({ next, request }) => next(request)
          })
        ]),
        expectReason("ResponseError")
      )
      assert.deepStrictEqual(seen?.headers, Headers.fromInput(headers))
      assert.deepStrictEqual(reason.headers, Headers.fromInput(headers))
    }))

  it.effect("an application/json 429 whose errors is not a list is a TransportError carrying its Retry-After", () =>
    Effect.gen(function*() {
      const reason = yield* callViewer(() =>
        new Response(JSON.stringify({ errors: "Throttled" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "5" }
        })
      ).pipe(expectReason("TransportError"))
      assert.strictEqual(reason.status, 429)
      assert.deepStrictEqual(reason.retryAfter, Duration.seconds(5))
    }))

  it.effect("a non-GraphQL 403 is a TransportError carrying response headers without Retry-After", () =>
    Effect.gen(function*() {
      const headers = { "content-type": "text/plain", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791768600" }
      const reason = yield* callViewer(() => new Response("Secondary rate limit", { status: 403, headers })).pipe(
        expectReason("TransportError")
      )
      assert.strictEqual(reason.status, 403)
      assert.deepStrictEqual(reason.headers, Headers.fromInput(headers))
    }))

  it.effect("a non-GraphQL 503 is a TransportError carrying a numeric Retry-After", () =>
    Effect.gen(function*() {
      const reason = yield* callViewer(() => unavailable("30")).pipe(expectReason("TransportError"))
      assert.strictEqual(reason.status, 503)
      assert.deepStrictEqual(reason.retryAfter, Duration.seconds(30))
      assert.isTrue(HttpClientError.isHttpClientError(reason.cause))
    }))

  it.effect("an HTTP-date Retry-After is measured from the Effect clock", () =>
    Effect.gen(function*() {
      // it.effect runs under TestClock, whose current time is the Unix epoch.
      const reason = yield* callViewer(() => unavailable(new Date(45_000).toUTCString())).pipe(
        expectReason("TransportError")
      )
      assert.deepStrictEqual(reason.retryAfter, Duration.seconds(45))
    }))

  it.effect("a network failure is a retryable TransportError without status", () =>
    Effect.gen(function*() {
      const failing = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, description: "ECONNREFUSED" })
            })
          )
        )
      )
      const reason = yield* GraphQLClient.make(ViewerGroup).pipe(
        Effect.flatMap((client) => client.Viewer()),
        Effect.provide(GraphQLProtocol.layerHttp({ url: "http://localhost/graphql" }).pipe(Layer.provide(failing))),
        expectReason("TransportError")
      )
      assert.isUndefined(reason.status)
      assert.isTrue(reason.isRetryable)
    }))
})
