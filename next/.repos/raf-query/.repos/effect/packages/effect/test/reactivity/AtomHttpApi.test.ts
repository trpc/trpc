import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Exit, Layer, Ref, Schema, Stream } from "effect"
import { Sse } from "effect/encoding"
import { HttpClient, HttpClientResponse } from "effect/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import type * as HttpClientError from "effect/http/HttpClientError"
import { Atom, AtomHttpApi, AtomRegistry, Hydration } from "effect/reactivity"

const Api = HttpApi.make("api").add(
  HttpApiGroup.make("group").add(
    HttpApiEndpoint.get("get", "/users/:id", {
      params: {
        id: Schema.FiniteFromString
      },
      query: {
        page: Schema.FiniteFromString
      }
    })
  )
)

const TopLevelApi = HttpApi.make("top-level-api").add(
  HttpApiGroup.make("group", { topLevel: true }).add(
    HttpApiEndpoint.get("query", "/query"),
    HttpApiEndpoint.post("mutation", "/mutation")
  )
)

const StreamApi = HttpApi.make("StreamApi").add(
  HttpApiGroup.make("events").add(
    HttpApiEndpoint.get("watch", "/watch", { success: HttpApiSchema.StreamSse({ data: Schema.String }) })
  )
)

describe("AtomHttpApi", () => {
  it.effect("query keeps SSE decode options in the cache key and forwards them", () =>
    Effect.gen(function*() {
      const Client = makeStreamingClient()
      const registry = AtomRegistry.make()
      yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()))
      const limited = Client.query("group", "events", { sseOptions: { maxEventSize: 4 } })
      const defaults = Client.query("group", "events", {})
      assert.notStrictEqual(limited, defaults)
      assert.strictEqual(limited, Client.query("group", "events", { sseOptions: { maxEventSize: 4 } }))

      const limitedStream = yield* AtomRegistry.getResult(registry, limited)
      const defaultStream = yield* AtomRegistry.getResult(registry, defaults)
      const [error, values] = yield* Effect.all([
        limitedStream.pipe(Stream.runCollect, Effect.flip),
        Stream.runCollect(defaultStream)
      ], { concurrency: "unbounded" })

      assertEventTooLarge(error)
      assert.deepStrictEqual(values, ["hello"])
    }).pipe(Effect.scoped))

  it.effect("mutation forwards SSE decode options independently for each call", () =>
    Effect.gen(function*() {
      const Client = makeStreamingClient()
      const registry = AtomRegistry.make()
      yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()))
      const mutation = Client.mutation("group", "events", { responseMode: "decoded-only" })
      yield* AtomRegistry.mount(registry, mutation)

      registry.set(mutation, { sseOptions: { maxEventSize: 4 } })
      const limitedStream = yield* AtomRegistry.getResult(registry, mutation, { suspendOnWaiting: true })
      const error = yield* limitedStream.pipe(Stream.runCollect, Effect.flip)
      assertEventTooLarge(error)

      registry.set(mutation, {})
      const defaultStream = yield* AtomRegistry.getResult(registry, mutation, { suspendOnWaiting: true })
      assert.deepStrictEqual(yield* Stream.runCollect(defaultStream), ["hello"])
    }).pipe(Effect.scoped))

  it.effect("dispatches queries and mutations for top-level groups", () =>
    Effect.gen(function*() {
      const requests: Array<string> = []
      const httpClient = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          requests.push(request.url)
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
      const Client = AtomHttpApi.Service()("TopLevelClient", {
        api: TopLevelApi,
        httpClient: Layer.succeed(HttpClient.HttpClient, httpClient)
      })
      const registry = AtomRegistry.make()
      const query = Client.query("group", "query", {})
      const mutation = Client.mutation("group", "mutation")

      yield* AtomRegistry.mount(registry, query)
      yield* AtomRegistry.mount(registry, mutation)
      registry.set(mutation, {})

      const queryExit = yield* Effect.exit(AtomRegistry.getResult(registry, query, { suspendOnWaiting: true }))
      const mutationExit = yield* Effect.exit(AtomRegistry.getResult(registry, mutation, { suspendOnWaiting: true }))

      assert.deepStrictEqual(
        { mutation: mutationExit, query: queryExit, requests },
        { mutation: Exit.succeed(undefined), query: Exit.succeed(undefined), requests: ["/query", "/mutation"] }
      )
    }).pipe(Effect.scoped))

  it.effect("query creates a serializable atom with reactivity and retention that encodes the request", () =>
    Effect.gen(function*() {
      const requestRef = yield* Ref.make<
        {
          readonly url: string
          readonly urlParams: ReadonlyArray<readonly [string, string]>
        } | undefined
      >(undefined)

      const httpClient = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          yield* Ref.set(requestRef, {
            url: request.url,
            urlParams: request.urlParams.params
          })
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )

      const Client = AtomHttpApi.Service()("Client", {
        api: Api,
        httpClient: Layer.succeed(HttpClient.HttpClient, httpClient)
      })

      const atom = Client.query("group", "get", {
        params: { id: 1 },
        query: { page: 2 },
        reactivityKeys: ["users"],
        timeToLive: "1 minute",
        serializationKey: `1:2`
      })

      assert.deepStrictEqual(
        {
          idleTTL: atom.idleTTL,
          serializable: Atom.isSerializable(atom)
        },
        {
          idleTTL: 60_000,
          serializable: true
        }
      )
      assert.strictEqual(
        Client.query("group", "get", { params: { id: 2 }, query: { page: 3 }, timeToLive: 0 }).idleTTL,
        0
      )
      assert.strictEqual(
        Client.query("group", "get", { params: { id: 3 }, query: { page: 4 }, timeToLive: 0n }).idleTTL,
        0
      )
      const keepAliveAtom = Client.query("group", "get", {
        params: { id: 2 },
        query: { page: 3 },
        reactivityKeys: ["users"],
        timeToLive: "Infinity",
        serializationKey: "keep-alive"
      })
      assert.deepStrictEqual(
        {
          keepAlive: keepAliveAtom.keepAlive,
          serializable: Atom.isSerializable(keepAliveAtom)
        },
        {
          keepAlive: true,
          serializable: true
        }
      )
      if (!Atom.isSerializable(atom)) {
        assert.fail("expected query atom to be serializable")
      }
      const key = atom[Atom.SerializableTypeId].key

      const atomFromEncodedInput = Client.query("group", "get", {
        params: { id: 1 },
        query: { page: 2 },
        reactivityKeys: ["users"],
        timeToLive: "1 minute",
        serializationKey: `1:2`
      })
      if (!Atom.isSerializable(atomFromEncodedInput)) {
        assert.fail("expected query atom from encoded input to be serializable")
      }
      assert.strictEqual(atomFromEncodedInput[Atom.SerializableTypeId].key, key)

      const registry = AtomRegistry.make()
      const unmount = registry.mount(atom)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      const request = yield* Ref.get(requestRef)
      assert(request !== undefined)
      assert.strictEqual(request.url, "/users/1")
      assert.deepStrictEqual(request.urlParams, [["page", "2"]])

      const dehydrated = Hydration.toValues(Hydration.dehydrate(registry))
      assert.lengthOf(dehydrated, 1)
      assert.strictEqual(dehydrated[0]!.key, key)

      unmount()
    }))

  it.effect("returns generated SSE stream failures from queries", () =>
    Effect.gen(function*() {
      const Client = AtomHttpApi.Service()("StreamClient", {
        api: StreamApi,
        baseUrl: "https://example.test",
        httpClient: Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(
              request,
              new Response("retry: 1000\n\n", {
                headers: { "content-type": "text/event-stream" }
              })
            ))
          )
        )
      })
      const registry = AtomRegistry.make()
      const atom = Client.query("events", "watch", {})
      yield* AtomRegistry.mount(registry, atom)
      const stream = yield* AtomRegistry.getResult(registry, atom)
      const error = yield* Effect.flip(Stream.runCollect(stream))

      assert.deepStrictEqual(
        error,
        new Sse.Retry({ duration: Duration.millis(1000), lastEventId: undefined })
      )
    }).pipe(Effect.scoped))
})

const makeStreamingClient = () =>
  AtomHttpApi.Service()("StreamingClient", {
    baseUrl: "http://test",
    api: HttpApi.make("StreamingApi").add(
      HttpApiGroup.make("group").add(
        HttpApiEndpoint.get("events", "/events", {
          success: HttpApiSchema.StreamSse({ data: Schema.String })
        })
      )
    ),
    httpClient: Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(
          request,
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                const encoder = new TextEncoder()
                controller.enqueue(encoder.encode("data: "))
                controller.enqueue(encoder.encode("\"hello\"\n\n"))
                controller.close()
              }
            }),
            { headers: { "content-type": "text/event-stream" } }
          )
        ))
      )
    )
  })

const assertEventTooLarge = (error: unknown) => {
  assert.instanceOf(error, Sse.SseError)
  assert.instanceOf(error.reason, Sse.EventTooLarge)
  assert.strictEqual(error.reason.maxEventSize, 4)
}
