import { assert, describe, it } from "@effect/vitest"
import { Deferred, Duration, Effect, Fiber, Layer, Stream } from "effect"
import { GraphQLClient, GraphQLProtocol } from "effect/graphql"
import { TransportError } from "effect/graphql/GraphQLClientError"
import * as Headers from "effect/http/Headers"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as UrlParams from "effect/http/UrlParams"
import { TestClock } from "effect/testing"
import { expectReason, graphqlResponse, httpClientLayer, IssuesGroup, IssueUpdated } from "./fixtures.ts"

const url = "http://localhost/graphql"

const event = (title: string) => ({ data: { issueUpdated: { title } } })

const subscription: GraphQLProtocol.GraphQLRequest = {
  kind: "subscription",
  query: IssueUpdated.document,
  operationName: "IssueUpdated",
  variables: { id: "I_1" },
  headers: Headers.fromInput({ authorization: "Bearer t" }),
  urlParams: UrlParams.fromInput({ preview: "t" })
}

/**
 * A `text/event-stream` body that sends `chunks`, then fails with `error` or
 * stays open.
 */
const eventStream = (chunks: ReadonlyArray<string>, error?: Error) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      },
      pull(controller) {
        // Error only after the queued chunks are read; erroring in start discards them.
        if (error !== undefined) controller.error(error)
      }
    }),
    { headers: { "content-type": "text/event-stream" } }
  )

const next = (payload: unknown) => `event: next\ndata: ${JSON.stringify(payload)}\n\n`

const subscribe = (layer: Layer.Layer<HttpClient.HttpClient>) =>
  GraphQLProtocol.makeHttp({ url }).pipe(
    Effect.map((protocol) => protocol.subscribe(subscription)),
    Effect.provide(layer),
    Stream.unwrap
  )

describe("GraphQLProtocol.layerHttp subscriptions (graphql-sse distinct mode)", () => {
  it.effect("POSTs with Accept: text/event-stream and emits next events, without a status, until complete", () =>
    Effect.gen(function*() {
      let seen: { headers: Record<string, string>; body: unknown; url: URL } | undefined
      const events = yield* subscribe(httpClientLayer((request, bodyText, url) => {
        seen = { headers: request.headers, body: JSON.parse(bodyText!), url }
        return eventStream([next(event("a")), next(event("b")), "event: complete\ndata:\n\n"])
      })).pipe(Stream.runCollect)
      assert.deepStrictEqual(events, [
        { body: event("a"), headers: Headers.fromInput({ "content-type": "text/event-stream" }) },
        { body: event("b"), headers: Headers.fromInput({ "content-type": "text/event-stream" }) }
      ])
      assert.include(seen!.headers["accept"], "text/event-stream")
      assert.strictEqual(seen!.headers["authorization"], "Bearer t")
      assert.strictEqual(seen!.url.searchParams.get("preview"), "t")
      assert.deepStrictEqual(seen!.body, {
        query: IssueUpdated.document,
        operationName: "IssueUpdated",
        variables: { id: "I_1" }
      })
    }))

  it.effect("a body that ends without a complete event is a retryable TransportError", () =>
    Effect.gen(function*() {
      const error = yield* subscribe(
        httpClientLayer(() => new Response(next(event("a")), { headers: { "content-type": "text/event-stream" } }))
      ).pipe(Stream.runDrain, Effect.flip)
      assert.instanceOf(error, TransportError)
      assert.isTrue(error.isRetryable)
    }))

  it.live("a complete event without a data: line ends the stream", () =>
    Effect.gen(function*() {
      const events = yield* subscribe(httpClientLayer(() => eventStream([next(event("a")), "event: complete\n\n"])))
        .pipe(
          Stream.runCollect,
          Effect.timeout("2 seconds")
        )
      assert.deepStrictEqual(events.map((answer) => answer.body), [event("a")])
    }))

  it.effect("a retry: line becomes retryAfter when the stream then fails", () =>
    Effect.gen(function*() {
      const error = yield* subscribe(
        httpClientLayer(() => eventStream([next(event("a")), "retry: 3000\n\n"], new Error("connection reset")))
      ).pipe(Stream.runDrain, Effect.flip)
      assert.instanceOf(error, TransportError)
      assert.isTrue(error.isRetryable)
      assert.deepStrictEqual(error.retryAfter, Duration.seconds(3))
    }))

  it.effect("a GraphQL error response instead of a stream fails the client stream with ResponseError", () =>
    Effect.gen(function*() {
      const layer = GraphQLProtocol.layerHttp({ url }).pipe(
        Layer.provide(httpClientLayer(() => graphqlResponse({ errors: [{ message: "denied" }] }, { status: 400 })))
      )
      const reason = yield* GraphQLClient.make(IssuesGroup).pipe(
        Effect.map((client) => client.IssueUpdated({ id: "I_1" })),
        Effect.provide(layer),
        Stream.unwrap,
        Stream.runDrain,
        expectReason("ResponseError")
      )
      assert.deepStrictEqual(reason.errors, [{ message: "denied" }])
      assert.strictEqual(reason.status, 400)
    }))

  it.effect("a client stream refused with 403 and Retry-After reconnects after the delay", () =>
    Effect.gen(function*() {
      let attempts = 0
      const layer = GraphQLProtocol.layerHttp({ url }).pipe(
        Layer.provide(httpClientLayer(() =>
          ++attempts === 1
            ? new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit" }), {
              status: 403,
              headers: { "content-type": "application/json", "retry-after": "2" }
            })
            : eventStream([next(event("a")), "event: complete\ndata:\n\n"])
        ))
      )
      const fiber = yield* GraphQLClient.make(IssuesGroup).pipe(
        Effect.map((client) => client.IssueUpdated({ id: "I_1" })),
        Effect.provide(layer),
        Stream.unwrap,
        Stream.runCollect,
        Effect.forkChild
      )
      yield* TestClock.adjust("1999 millis")
      assert.strictEqual(attempts, 1)
      yield* TestClock.adjust("1 millis")
      assert.deepStrictEqual(yield* Fiber.join(fiber), [{ issueUpdated: { title: "a" } }])
      assert.strictEqual(attempts, 2)
    }))

  it.effect("interrupting the stream aborts the request", () =>
    Effect.gen(function*() {
      let signal: AbortSignal | undefined
      const layer = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request, _url, abort) => {
          signal = abort
          return Effect.succeed(HttpClientResponse.fromWeb(request, eventStream([next(event("a"))])))
        })
      )
      const received = yield* Deferred.make<void>()
      const fiber = yield* subscribe(layer).pipe(
        Stream.runForEach(() => Deferred.succeed(received, void 0)),
        Effect.forkChild
      )
      // Join too, so a stream that fails before its first event fails the test.
      yield* Deferred.await(received).pipe(Effect.raceFirst(Fiber.join(fiber)))
      assert.isFalse(signal!.aborted)
      yield* Fiber.interrupt(fiber)
      assert.isTrue(signal!.aborted)
    }))
})
