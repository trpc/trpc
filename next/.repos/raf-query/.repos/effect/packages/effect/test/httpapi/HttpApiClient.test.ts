import { assert, describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { Cause, Effect, Exit, Schema, Stream } from "effect"
import { Sse } from "effect/encoding"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

describe("HttpApiClient", () => {
  describe("ParseOptions", () => {
    const Fields = { firstName: Schema.String, lastName: Schema.String }
    const Person = Schema.Struct(Fields)

    const SseApi = HttpApi.make("SseApi").add(
      HttpApiGroup.make("test").add(HttpApiEndpoint.get("events", "/events", {
        success: HttpApiSchema.StreamSse({ data: Person, error: Schema.Struct({ reason: Schema.String }) })
      }))
    )

    it.effect("strict events-mode decoding omits an absent event ID", () =>
      Effect.gen(function*() {
        const decode = (wire: string) =>
          HttpApiClient.makeWith(
            StreamingApi.annotate(HttpApi.ParseOptions, { onExcessProperty: "error" }),
            { baseUrl: "http://test", httpClient: clientFromResponse(() => new Response(textStream([wire]))) }
          ).pipe(Effect.flatMap((client) => client.test.events({})), Effect.flatMap(Stream.runCollect))

        const error = yield* Effect.flip(decode("id: 1\nevent: person\ndata: hello\n\n"))
        assert.ok(Schema.isSchemaError(error))
        assert.include(error.message, "[\"id\"]")
        assert.deepStrictEqual(yield* decode("event: person\ndata: hello\n\n"), [{ event: "person", data: "hello" }])
      }))

    it.effect("strict SSE decoding accepts valid user data and framework event metadata", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(
          SseApi.annotate(HttpApi.ParseOptions, { onExcessProperty: "error" }),
          {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(
                textStream([
                  "id: 1\nevent: person\ndata: {\"firstName\":\"Ada\",\"lastName\":\"Lovelace\"}\n\n"
                ]),
                { headers: { "content-type": "text/event-stream" } }
              )
            )
          }
        )
        const events = yield* client.test.events({}).pipe(Effect.flatMap(Stream.runCollect))
        assert.deepStrictEqual(events, [{ firstName: "Ada", lastName: "Lovelace" }])
      }))

    it.effect("strict SSE decoding preserves reserved failure causes", () =>
      Effect.gen(function*() {
        const expected = Cause.fail({ reason: "boom" })
        const FailureSchema = Schema.fromJsonString(Schema.toCodecJson(Schema.Cause(StreamError, Schema.Defect())))
        const data = yield* Schema.encodeEffect(FailureSchema)(expected)
        const client = yield* HttpApiClient.makeWith(
          SseApi.annotate(HttpApi.ParseOptions, { onExcessProperty: "error" }),
          {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(
                textStream([
                  Sse.encoder.write({ _tag: "Event", event: "effect/http-api/stream/failure", id: undefined, data })
                ]),
                { headers: { "content-type": "text/event-stream" } }
              )
            )
          }
        )
        const exit = yield* client.test.events({}).pipe(Effect.flatMap(Stream.runCollect), Effect.exit)
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const error = Cause.squash(exit.cause)
          assert.isFalse(Schema.isSchemaError(error), error instanceof Error ? error.message : undefined)
          assert.deepStrictEqual(exit.cause, expected)
        }
      }))

    it.effect("strict SSE decoding rejects excess properties in user event data", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(
          SseApi.annotate(HttpApi.ParseOptions, { onExcessProperty: "error" }),
          {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(
                textStream([
                  "data: {\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"extra\":true}\n\n"
                ]),
                { headers: { "content-type": "text/event-stream" } }
              )
            )
          }
        )
        const exit = yield* client.test.events({}).pipe(Effect.flatMap(Stream.runCollect), Effect.exit)
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const error = Cause.squash(exit.cause)
          assert.ok(Schema.isSchemaError(error))
          assert.include(error.message, "Expected no excess property")
          assert.include(error.message, "[\"data\"][\"extra\"]")
          assert.notInclude(error.message, "[\"_tag\"]")
        }
      }))

    it.effect("client payload encoding collects all issues", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("users").add(HttpApiEndpoint.post("create", "/users", { payload: Person }))
        ).annotate(HttpApi.ParseOptions, { errors: "all" })
        let requests = 0
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => {
            requests++
            return new Response(null, { status: 204 })
          })
        })
        const exit = yield* Effect.exit(client.users.create({ payload: {} as typeof Person.Type }))
        assert.strictEqual(requests, 0)
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const error = Cause.squash(exit.cause)
          assert.ok(Schema.isSchemaError(error))
          assert.include(error.message, "firstName")
          assert.include(error.message, "lastName")
        }
      }))

    it.effect("client response decoding collects all issues", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("users").add(HttpApiEndpoint.get("get", "/users", { success: Person }))
        ).annotate(HttpApi.ParseOptions, { errors: "all" })
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response("{}", { headers: { "content-type": "application/json" } }))
        })
        const exit = yield* Effect.exit(client.users.get({}))
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const error = Cause.squash(exit.cause)
          assert.ok(Schema.isSchemaError(error))
          assert.include(error.message, "firstName")
          assert.include(error.message, "lastName")
        }
      }))

    it("urlBuilder uses group options over API options", () => {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("get", "/users", { query: Person }))
          .annotate(HttpApi.ParseOptions, { errors: "all" })
      ).annotate(HttpApi.ParseOptions, { errors: "first" })
      const urls = HttpApiClient.urlBuilder(Api)
      assert.throws(() => urls.users.get({ query: {} as typeof Person.Type }), /firstName[\s\S]*lastName/)
    })
  })

  describe("slot ParseOptions", () => {
    const Strict = { onExcessProperty: "error" } as const
    const Person = Schema.Struct({ name: Schema.String })
    const adaWithExtra = { name: "Ada", extra: true }

    it.effect("API slot annotations replace endpoint ParseOptions for request codecs", () =>
      Effect.gen(function*() {
        const Group = HttpApiGroup.make("test").add(
          HttpApiEndpoint.post("create", "/users/:id", {
            params: { id: Schema.String },
            query: { q: Schema.String },
            headers: { "x-api-key": Schema.String },
            payload: Person
          }).annotate(HttpApi.ParseOptions, Strict)
        )
        const request = {
          params: { id: "1", extraParam: "p" },
          query: { q: "x", extraQuery: "q" },
          headers: { "x-api-key": "key", "x-extra": "h" },
          payload: { name: "Ada", extraPayload: true }
        }
        const requests: Array<{ readonly url: string; readonly headers: Record<string, string> }> = []
        const create = (api: HttpApi.HttpApi<"Api", typeof Group>) =>
          HttpApiClient.makeWith(api, {
            baseUrl: "http://test",
            httpClient: HttpClient.make((request, url) =>
              Effect.sync(() => {
                requests.push({ url: url.toString(), headers: request.headers })
                return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
              })
            )
          }).pipe(Effect.flatMap((client) => Effect.exit(client.test.create(request))), Effect.map(String))

        // Encoded in order: params, payload, headers, query.
        let api = HttpApi.make("Api").add(Group)
        assert.include(yield* create(api), "extraParam")
        api = api.annotate(HttpApi.ParamsParseOptions, {})
        assert.include(yield* create(api), "extraPayload")
        // Replaces ParseOptions: onExcessProperty is not merged in.
        api = api.annotate(HttpApi.PayloadParseOptions, { errors: "first" })
        assert.include(yield* create(api), "x-extra")
        api = api.annotate(HttpApi.HeadersParseOptions, {})
        assert.include(yield* create(api), "extraQuery")
        api = api.annotate(HttpApi.QueryParseOptions, {})
        yield* create(api)
        assert.strictEqual(requests.length, 1)
        assert.strictEqual(requests[0]!.url, "http://test/users/1?q=x")
        assert.strictEqual(requests[0]!.headers["x-api-key"], "key")
        assert.isUndefined(requests[0]!.headers["x-extra"])
        strictEqual(HttpApiClient.urlBuilder(api).test.create(request), "/users/1?q=x")
      }))

    it.effect("buffered responses decode headers, success and error bodies with their own slots", () =>
      Effect.gen(function*() {
        const Group = HttpApiGroup.make("test").add(
          HttpApiEndpoint.get("get", "/user", {
            success: HttpApiSchema.WithHeaders(Person, { "x-count": Schema.Int }),
            error: Person.pipe(HttpApiSchema.status(400))
          }).annotate(HttpApi.ParseOptions, Strict)
        )
        const get = (api: HttpApi.HttpApi<"Api", typeof Group>, status: number) =>
          HttpApiClient.makeWith(api, {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(JSON.stringify(adaWithExtra), {
                status,
                headers: { "content-type": "application/json", "server": "test", "x-count": "1" }
              })
            )
          }).pipe(Effect.flatMap((client) => Effect.exit(client.test.get({}))))

        let api = HttpApi.make("Api").add(Group).annotate(HttpApi.SuccessParseOptions, {})
        const headersError = yield* get(api, 200)
        assert.strictEqual(headersError._tag, "Failure")
        assert.include(String(headersError), `["content-type"]`)

        api = api.annotate(HttpApi.HeadersParseOptions, {})
        const value = yield* get(api, 200)
        assert.deepStrictEqual(
          value,
          Exit.succeed(HttpApiSchema.withHeaders({ body: { name: "Ada" }, headers: { "x-count": 1 } }))
        )

        const strictError = yield* get(api, 400)
        assert.ok(strictError._tag === "Failure" && HttpClientError.isHttpClientError(Cause.squash(strictError.cause)))
        assert.deepStrictEqual(yield* get(api.annotate(HttpApi.ErrorParseOptions, {}), 400), Exit.fail({ name: "Ada" }))
      }))

    it.effect("streamed WithHeaders responses decode headers and events with their own slots", () =>
      Effect.gen(function*() {
        const Group = HttpApiGroup.make("test").add(
          HttpApiEndpoint.get("events", "/events", {
            success: HttpApiSchema.WithHeaders(
              HttpApiSchema.StreamSse({ data: Person, error: StreamError }),
              { "x-count": Schema.Int }
            )
          })
        )
        const events = (api: HttpApi.HttpApi<"Api", typeof Group>) =>
          HttpApiClient.makeWith(api, {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(textStream([`data: ${JSON.stringify(adaWithExtra)}\n\n`]), {
                headers: { "content-type": "text/event-stream", "x-count": "1" }
              })
            )
          }).pipe(
            Effect.flatMap((client) => client.test.events({})),
            Effect.flatMap(({ body, headers }) =>
              Effect.map(Stream.runCollect(body), (events) => ({ events, headers }))
            ),
            Effect.exit
          )

        const api = HttpApi.make("Api").add(Group)
          .annotate(HttpApi.ParseOptions, Strict)
          .annotate(HttpApi.HeadersParseOptions, {})
        const strictEvents = yield* events(api)
        assert.include(String(strictEvents), `["data"]["extra"]`)
        assert.deepStrictEqual(
          yield* events(api.annotate(HttpApi.SuccessParseOptions, {})),
          Exit.succeed({ events: [{ name: "Ada" }], headers: { "x-count": 1 } })
        )
      }))

    it.effect("encodeToWithHeaders decodes header transformations with HeadersParseOptions", () =>
      Effect.gen(function*() {
        class Invalid extends Schema.TaggedError<Invalid>()("Invalid", { a: Schema.Finite, b: Schema.Finite }) {}
        const InvalidResponse = Invalid.pipe(HttpApiSchema.encodeToWithHeaders({
          body: Schema.String.pipe(HttpApiSchema.status(400), HttpApiSchema.asText()),
          headers: { "x-a": Schema.FiniteFromString, "x-b": Schema.FiniteFromString }
        }, {
          decode: ({ headers }) => new Invalid({ a: headers["x-a"], b: headers["x-b"] }),
          encode: (error) => ({ body: "invalid", headers: { "x-a": error.a, "x-b": error.b } })
        }))
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(HttpApiEndpoint.get("get", "/invalid", { error: InvalidResponse }))
        )
          .annotate(HttpApi.ParseOptions, { errors: "first" })
          .annotate(HttpApi.HeadersParseOptions, { errors: "all" })
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response("invalid", {
              status: 400,
              headers: { "content-type": "text/plain", "x-a": "bad", "x-b": "bad" }
            })
          )
        })

        const exit = String(yield* Effect.exit(client.test.get({})))
        assert.include(exit, `["x-a"]`)
        assert.include(exit, `["x-b"]`)
      }))

    it.effect("encodeToWithHeaders validates the mapped response value", () =>
      Effect.gen(function*() {
        const Positive = Schema.Number.check(Schema.isGreaterThan(0))
        const ResponseSchema = Positive.pipe(HttpApiSchema.encodeToWithHeaders({
          body: Schema.String.pipe(HttpApiSchema.asText()),
          headers: { "x-value": Schema.FiniteFromString }
        }, {
          decode: ({ headers }) => headers["x-value"],
          encode: (value) => ({ body: "value", headers: { "x-value": value } })
        }))
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(HttpApiEndpoint.get("get", "/value", { success: ResponseSchema }))
        )
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response("value", { headers: { "content-type": "text/plain", "x-value": "-1" } })
          )
        })

        const exit = yield* Effect.exit(client.test.get({}))
        assert.strictEqual(exit._tag, "Failure")
        assert.include(String(exit), "greater than 0")
      }))
  })

  describe("literal action suffixes", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("operations").add(
        HttpApiEndpoint.post("wait", "/operations/:id:wait", {
          params: Schema.Struct({ id: Schema.String })
        })
      )
    )
    const expectedUrl = "https://api.example.com/operations/op_1:wait"

    it("urlBuilder preserves the undeclared action suffix", () => {
      const urls = HttpApiClient.urlBuilder(Api, { baseUrl: "https://api.example.com" })

      strictEqual(urls.operations.wait({ params: { id: "op_1" } }), expectedUrl)
    })

    it.effect("make sends the request with the literal action suffix", () =>
      Effect.gen(function*() {
        let requestUrl: string | undefined
        const httpClient = HttpClient.make((request, url) =>
          Effect.sync(() => {
            requestUrl = url.toString()
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
          })
        )
        const client = yield* HttpApiClient.make(Api, { baseUrl: "https://api.example.com" }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient)
        )

        yield* client.operations.wait({ params: { id: "op_1" } })

        strictEqual(requestUrl, expectedUrl)
      }))
  })

  describe("streaming responses", () => {
    it.effect("decodes StreamSse events incrementally", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(
              textStream([
                "event: first\ndata: one\n\n",
                "event: second\ndata: two\n\n"
              ]),
              { status: 200 }
            )
          )
        })

        const stream = yield* client.test.events({})
        const first = yield* stream.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(first, [{ event: "first", data: "one" }])
      }))

    it.effect("keeps per-call SSE decode options isolated", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response(textStream(["data: ", "hello\n\n"]), { status: 200 }))
        })

        const limitedStream = yield* client.test.events({ sseOptions: { maxEventSize: 4 } })
        const defaultStream = yield* client.test.events({})
        const [error, events] = yield* Effect.all([
          limitedStream.pipe(Stream.runCollect, Effect.flip),
          Stream.runCollect(defaultStream)
        ], { concurrency: "unbounded" })

        assert.instanceOf(error, Sse.SseError)
        assert.instanceOf(error.reason, Sse.EventTooLarge)
        assert.strictEqual(error.reason.maxEventSize, 4)
        assert.deepStrictEqual(events, [{ event: "message", data: "hello" }])
      }))

    it.effect("keeps StreamSse parser state isolated between responses", () =>
      Effect.gen(function*() {
        const bodies = [
          "event: first\ndata: one\n\n",
          "event: second\ndata: two\n\n"
        ]
        let index = 0
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response(textStream([bodies[index++]!]), { status: 200 }))
        })

        const first = yield* client.test.events({}).pipe(Effect.flatMap(Stream.runCollect))
        const second = yield* client.test.events({}).pipe(Effect.flatMap(Stream.runCollect))

        assert.deepStrictEqual(first, [{ event: "first", data: "one" }])
        assert.deepStrictEqual(second, [{ event: "second", data: "two" }])
      }))

    it.effect("decodes StreamSse reserved failure events as full causes", () =>
      Effect.gen(function*() {
        const expectedCause = Cause.fail({ reason: "boom" })
        const FailureSchema = Schema.toCodecJson(Schema.Cause(StreamError, Schema.Defect()))
        const encodeCause = Schema.encodeUnknownEffect(Schema.fromJsonString(FailureSchema))
        const encodedCause = yield* encodeCause(expectedCause)
        const failureEvent = Sse.encoder.write({
          _tag: "Event",
          event: "effect/http-api/stream/failure",
          id: undefined,
          data: encodedCause
        })

        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response(textStream([failureEvent]), { status: 200 }))
        })

        const stream = yield* client.test.events({})
        const exit = yield* Effect.exit(Stream.runCollect(stream))

        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          assert.deepStrictEqual(exit.cause, expectedCause)
        }
      }))

    it.effect("emits StreamSse reserved names with non-Cause data as user events", () =>
      Effect.gen(function*() {
        const failureEvent = Sse.encoder.write({
          _tag: "Event",
          event: "effect/http-api/stream/failure",
          id: undefined,
          data: "not-json"
        })

        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response(textStream([failureEvent]), { status: 200 }))
        })

        const stream = yield* client.test.events({})
        const events = yield* Stream.runCollect(stream)

        assert.deepStrictEqual(events, [{
          event: "effect/http-api/stream/failure",
          data: "not-json"
        }])
      }))

    it.effect("returns StreamUint8Array response bytes incrementally", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(byteStream([new Uint8Array([1, 2]), new Uint8Array([3])]), { status: 200 })
          )
        })

        const stream = yield* client.test.download({})
        const first = yield* stream.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(first.map((chunk) => Array.from(chunk)), [[1, 2]])
      }))

    it.effect("decodes WithHeaders StreamUint8Array bodies and headers", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(
            HttpApiEndpoint.get("download", "/download", {
              success: HttpApiSchema.WithHeaders(
                HttpApiSchema.StreamUint8Array(),
                { "x-count": Schema.Int }
              )
            })
          )
        )
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(byteStream([new Uint8Array([1, 2]), new Uint8Array([3])]), {
              status: 200,
              headers: { "x-count": "2" }
            })
          )
        })

        const value = yield* client.test.download({})
        const first = yield* value.body.pipe(Stream.take(1), Stream.runCollect)

        assert.deepStrictEqual(value.headers, { "x-count": 2 })
        assert.deepStrictEqual(first.map((chunk) => Array.from(chunk)), [[1, 2]])
      }))

    it.effect("decodes WithHeaders StreamSse bodies and headers", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(
            HttpApiEndpoint.get("events", "/events", {
              success: HttpApiSchema.WithHeaders(
                HttpApiSchema.StreamSse({
                  data: Schema.Struct({ text: Schema.String }),
                  error: StreamError
                }),
                { "x-count": Schema.Int }
              )
            })
          )
        )
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(textStream([`data: {"text":"hello"}\n\n`]), {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
                "x-count": "1"
              }
            })
          )
        })

        const value = yield* client.test.events({})
        const events = yield* Stream.runCollect(value.body)

        assert.deepStrictEqual(value.headers, { "x-count": 1 })
        assert.deepStrictEqual(events, [{ text: "hello" }])
      }))

    it.effect("fails invalid WithHeaders stream headers before returning the body", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(
            HttpApiEndpoint.get("download", "/download", {
              success: HttpApiSchema.WithHeaders(
                HttpApiSchema.StreamUint8Array(),
                { "x-count": Schema.Int }
              )
            })
          )
        )
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(byteStream([new Uint8Array([1])]), {
              status: 200,
              headers: { "x-count": "invalid" }
            })
          )
        })

        const exit = yield* Effect.exit(client.test.download({}))

        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          assert.strictEqual((Cause.squash(exit.cause) as { readonly _tag?: string })._tag, "SchemaError")
        }
      }))

    it.effect("forwards SSE options through mixed WithHeaders content-type selection", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(
            HttpApiEndpoint.get("chat", "/chat", {
              success: [
                Schema.Struct({ message: Schema.String }),
                HttpApiSchema.WithHeaders(
                  HttpApiSchema.StreamSse({ data: Schema.Struct({ text: Schema.String }) }),
                  { "x-count": Schema.Int }
                )
              ]
            })
          )
        )
        const client = yield* HttpApiClient.makeWith(Api, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(textStream(["data: ", `{"text":"hello"}\n\n`]), {
              status: 200,
              headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "x-count": "1"
              }
            })
          )
        })

        const value = yield* client.test.chat({ sseOptions: { maxEventSize: 4 } })
        if (!(HttpApiSchema.WithHeadersValueTypeId in value)) {
          throw new Error("Expected WithHeaders response")
        }
        const error = yield* value.body.pipe(Stream.runCollect, Effect.flip)

        assert.deepStrictEqual(value.headers, { "x-count": 1 })
        assert.instanceOf(error, Sse.SseError)
        assert.instanceOf(error.reason, Sse.EventTooLarge)
        assert.strictEqual(error.reason.maxEventSize, 4)

        const defaultValue = yield* client.test.chat({})
        if (!(HttpApiSchema.WithHeadersValueTypeId in defaultValue)) {
          throw new Error("Expected WithHeaders response")
        }
        const events = yield* Stream.runCollect(defaultValue.body)
        assert.deepStrictEqual(defaultValue.headers, { "x-count": 1 })
        assert.deepStrictEqual(events, [{ text: "hello" }])
      }))

    it.effect("decodes StreamSse successes at the annotated status", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(AnnotatedStreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(textStream(["event: annotated\ndata: ok\n\n"]), { status: 202 })
          )
        })

        const stream = yield* client.test.events({})
        const events = yield* Stream.runCollect(stream)
        assert.deepStrictEqual(events, [{ event: "annotated", data: "ok" }])
      }))

    it.effect("decodes StreamUint8Array successes at the annotated status", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(AnnotatedStreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() => new Response(byteStream([new Uint8Array([4, 5])]), { status: 206 }))
        })

        const stream = yield* client.test.download({})
        const chunks = yield* Stream.runCollect(stream)
        assert.deepStrictEqual(chunks.map((chunk) => Array.from(chunk)), [[4, 5]])
      }))

    it.effect("decodes non-success responses through endpoint error schemas before returning a stream", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(JSON.stringify({ _tag: "EndpointError", message: "bad request" }), {
              status: 400,
              headers: { "content-type": "application/json" }
            })
          )
        })

        const error = yield* Effect.flip(client.test.events({}))
        assert.deepStrictEqual(error, new EndpointError({ message: "bad request" }))
      }))

    it.effect("preserves response-only raw response stream access", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(StreamingApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(
              byteStream([
                new Uint8Array([1]),
                new Uint8Array([2, 3])
              ]),
              { status: 200 }
            )
          )
        })

        const response = yield* client.test.download({ responseMode: "response-only" })
        const chunks = yield* Stream.runCollect(response.stream)
        assert.deepStrictEqual(chunks.map((chunk) => Array.from(chunk)), [[1], [2, 3]])
      }))

    it.effect("selects a buffered response by content type when a stream uses the same status", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(MixedSuccessApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(JSON.stringify({ message: "done" }), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
          )
        })

        const response = yield* client.test.chat({})
        assert.deepStrictEqual(response, { message: "done" })
      }))

    it.effect("selects a stream response by content type when buffered success uses the same status", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.makeWith(MixedSuccessApi, {
          baseUrl: "http://test",
          httpClient: clientFromResponse(() =>
            new Response(textStream([`event: token\ndata: {"text":"hello"}\n\n`]), {
              status: 200,
              headers: { "content-type": "text/event-stream; charset=utf-8" }
            })
          )
        })

        const stream = yield* client.test.chat({})
        if (!Stream.isStream(stream)) {
          throw new Error("Expected stream response")
        }
        const events = yield* Stream.runCollect(stream)
        assert.deepStrictEqual(events, [{ text: "hello" }])
      }))
  })

  describe("error responses", () => {
    const makeClient = (response: () => Response) =>
      HttpApiClient.makeWith(ErrorContentTypeApi, {
        baseUrl: "http://test",
        httpClient: clientFromResponse(response)
      })

    it.effect("selects schemas by normalized content type regardless of declaration order", () =>
      Effect.gen(function*() {
        for (const endpoint of ["textFirst", "jsonFirst"] as const) {
          const jsonClient = yield* makeClient(() =>
            new Response(JSON.stringify({ _tag: "JsonError", message: "bad request" }), {
              status: 400,
              headers: { "content-type": "Application/JSON; charset=utf-8" }
            })
          )
          const jsonError = yield* Effect.flip(jsonClient.test[endpoint]({}))
          assert.deepStrictEqual(jsonError, { _tag: "JsonError", message: "bad request" })

          const textClient = yield* makeClient(() =>
            new Response("bad request", {
              status: 400,
              headers: { "content-type": "text/plain" }
            })
          )
          const textError = yield* Effect.flip(textClient.test[endpoint]({}))
          assert.strictEqual(textError, "bad request")
        }
      }))

    it.effect("reports unsupported error response content types", () =>
      Effect.gen(function*() {
        const client = yield* makeClient(() =>
          new Response("<error />", {
            status: 400,
            headers: { "content-type": "application/xml" }
          })
        )

        const exit = yield* Effect.exit(client.test.textFirst({}))
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const errors: Array<unknown> = []
          for (const reason of exit.cause.reasons) {
            if (Cause.isFailReason(reason)) {
              errors.push(reason.error)
            }
          }
          assert.ok(
            errors.some((error) => HttpClientError.isHttpClientError(error) && error.reason._tag === "StatusCodeError")
          )
          const decodeError = errors.find((error) =>
            HttpClientError.isHttpClientError(error) && error.reason._tag === "DecodeError"
          )
          assert.ok(HttpClientError.isHttpClientError(decodeError))
          assert.strictEqual(decodeError.reason._tag, "DecodeError")
          assert.ok(decodeError.reason.description?.includes("Unsupported response content-type"))
        }
      }))

    it.effect("decodes no-content errors without a content-type header", () =>
      Effect.gen(function*() {
        const client = yield* makeClient(() => new Response(null, { status: 400 }))

        const error = yield* Effect.flip(client.test.noContent({}))
        assert.strictEqual(error, "NoContentError")
      }))

    it.effect("groups schemas by normalized declared content type", () =>
      Effect.gen(function*() {
        const client = yield* makeClient(() =>
          new Response(JSON.stringify({ _tag: "SecondJsonError", message: "bad request" }), {
            status: 400,
            headers: { "content-type": "application/problem+json" }
          })
        )

        const error = yield* Effect.flip(client.test.equivalentJson({}))
        assert.deepStrictEqual(error, { _tag: "SecondJsonError", message: "bad request" })
      }))
  })

  it.effect("decodes form-urlencoded responses", () =>
    Effect.gen(function*() {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(
          HttpApiEndpoint.get("form", "/form", {
            success: Schema.Struct({ name: Schema.String }).pipe(HttpApiSchema.asFormUrlEncoded())
          })
        )
      )
      const client = yield* HttpApiClient.makeWith(Api, {
        baseUrl: "https://example.test",
        httpClient: clientFromResponse(() =>
          new Response("name=Ada", {
            status: 200,
            headers: { "content-type": "application/x-www-form-urlencoded" }
          })
        )
      })

      const value = yield* client.test.form({})

      assert.deepStrictEqual(value, { name: "Ada" })
    }))

  describe("response headers", () => {
    it.effect("fails response decoding when a declared header is invalid", () =>
      Effect.gen(function*() {
        const Api = HttpApi.make("Api").add(
          HttpApiGroup.make("test").add(
            HttpApiEndpoint.get("created", "/created", {
              success: HttpApiSchema.WithHeaders(
                Schema.Struct({ id: Schema.Int }),
                { "x-count": Schema.Int }
              )
            })
          )
        )
        const decodeFailure = Effect.fnUntraced(function*(body: unknown, count: string) {
          const client = yield* HttpApiClient.makeWith(Api, {
            baseUrl: "http://test",
            httpClient: clientFromResponse(() =>
              new Response(JSON.stringify(body), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                  "x-count": count
                }
              })
            )
          })
          const exit = yield* Effect.exit(client.test.created({}))
          assert.strictEqual(exit._tag, "Failure")
          if (exit._tag === "Success") {
            throw new Error("Expected response decoding to fail")
          }
          return Cause.squash(exit.cause) as { readonly _tag?: string }
        })

        const bodyError = yield* decodeFailure({ id: "invalid" }, "1")
        const headerError = yield* decodeFailure({ id: 1 }, "invalid")

        assert.strictEqual(bodyError._tag, "SchemaError")
        assert.strictEqual(headerError._tag, bodyError._tag)
      }))
  })

  describe("urlBuilder", () => {
    const Api = HttpApi.make("Api")
      .add(
        HttpApiGroup.make("users")
          .add(
            HttpApiEndpoint.get("getUser", "/users/:id", {
              params: {
                id: Schema.Finite
              },
              query: {
                page: Schema.Finite,
                tags: Schema.Array(Schema.Finite)
              }
            }),
            HttpApiEndpoint.get("health", "/health")
          )
      )

    it("builds urls using endpoint schemas", () => {
      const builder = HttpApiClient.urlBuilder(Api, {
        baseUrl: "https://api.example.com"
      })

      strictEqual(
        builder.users.getUser({
          params: {
            id: 123
          },
          query: {
            page: 1,
            tags: [1, 2]
          }
        }),
        "https://api.example.com/users/123?page=1&tags=1&tags=2"
      )
    })

    it("preserves a base URL pathname", () => {
      const builder = HttpApiClient.urlBuilder(Api, {
        baseUrl: "https://api.example.com/v1"
      })

      strictEqual(builder.users.health(), "https://api.example.com/v1/health")
    })

    it("encodes path parameters", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("stacks")
            .add(
              HttpApiEndpoint.get("listResources", "/state/stacks/:stack/stages/:stage/resources", {
                params: {
                  stack: Schema.String,
                  stage: Schema.String
                }
              })
            )
        )
      const builder = HttpApiClient.urlBuilder(Api, {
        baseUrl: "https://api.example.com"
      })

      strictEqual(
        builder.stacks.listResources({
          params: {
            stack: "a/b",
            stage: "prod/blue"
          }
        }),
        "https://api.example.com/state/stacks/a%2Fb/stages/prod%2Fblue/resources"
      )
    })

    it("omits missing optional path parameters", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("files")
            .add(
              HttpApiEndpoint.get("download", "/files/:path?", {
                params: {
                  path: Schema.optional(Schema.String)
                }
              })
            )
        )
      const builder = HttpApiClient.urlBuilder(Api, {
        baseUrl: "https://api.example.com"
      })

      strictEqual(
        builder.files.download({ params: {} }),
        "https://api.example.com/files"
      )
      strictEqual(
        builder.files.download({ params: { path: "a/b" } }),
        "https://api.example.com/files/a%2Fb"
      )
    })

    it("returns relative urls when baseUrl is omitted", () => {
      const builder = HttpApiClient.urlBuilder(Api)

      strictEqual(builder.users.health(), "/health")
    })

    it("supports top-level endpoints", () => {
      const TopLevelApi = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("top", { topLevel: true })
            .add(
              HttpApiEndpoint.get("health", "/health")
            )
        )
        .prefix("/v1")

      const builder = HttpApiClient.urlBuilder(TopLevelApi, {
        baseUrl: "https://api.example.com"
      })

      strictEqual(builder.health(), "https://api.example.com/v1/health")
    })

    it("stores __proto__ identifiers as own properties", () => {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("__proto__").add(
          HttpApiEndpoint.get("__proto__", "/proto")
        )
      )
      const builder = HttpApiClient.urlBuilder(Api)

      assert.isTrue(Object.hasOwn(builder, "__proto__"))
      assert.isTrue(Object.hasOwn(builder["__proto__"], "__proto__"))
      strictEqual(builder["__proto__"]["__proto__"](), "/proto")
    })
  })

  it.effect("stores __proto__ client identifiers as own properties", () =>
    Effect.gen(function*() {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("__proto__").add(
          HttpApiEndpoint.get("__proto__", "/proto")
        )
      )
      const httpClient = clientFromResponse(() => new Response(null, { status: 204 }))
      const client = yield* HttpApiClient.makeWith(Api, { httpClient })
      const groupClient = yield* HttpApiClient.group(Api, {
        group: "__proto__",
        httpClient
      })

      assert.isTrue(Object.hasOwn(client, "__proto__"))
      assert.isTrue(Object.hasOwn(client["__proto__"], "__proto__"))
      assert.strictEqual(typeof client["__proto__"]["__proto__"], "function")
      assert.isTrue(Object.hasOwn(groupClient, "__proto__"))
      assert.strictEqual(typeof groupClient["__proto__"], "function")
    }))

  it.effect("applies transformClient to endpoint clients exactly once", () =>
    Effect.gen(function*() {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(HttpApiEndpoint.get("health", "/health"))
      )
      let transformations = 0
      const httpClient = HttpClient.make((request, url) =>
        Effect.sync(() => {
          strictEqual(url.toString(), "https://api.example.com/health")
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
        })
      )
      const health = yield* HttpApiClient.endpoint(Api, {
        group: "test",
        endpoint: "health",
        httpClient,
        transformClient: (client) => {
          transformations++
          return client.pipe(
            HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.example.com"))
          )
        }
      })

      yield* health({ responseMode: "response-only" })
      yield* health({ responseMode: "response-only" })

      strictEqual(transformations, 1)
    }))

  it.effect("encodes path parameters when executing requests", () =>
    Effect.gen(function*() {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("stacks")
            .add(
              HttpApiEndpoint.get("listResources", "/state/stacks/:stack/stages/:stage/resources", {
                params: {
                  stack: Schema.String,
                  stage: Schema.String
                }
              })
            )
        )
      const httpClient = HttpClient.make((request, url) =>
        Effect.sync(() => {
          strictEqual(url.toString(), "https://api.example.com/state/stacks/a%2Fb/stages/prod%2Fblue/resources")
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
        })
      )
      const client = yield* HttpApiClient.makeWith(Api, {
        httpClient,
        baseUrl: "https://api.example.com"
      })

      yield* client.stacks.listResources({
        params: {
          stack: "a/b",
          stage: "prod/blue"
        },
        responseMode: "response-only"
      })
    }))

  it.effect("omits optional path parameters when executing requests", () =>
    Effect.gen(function*() {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("files")
            .add(
              HttpApiEndpoint.get("download", "/files/:path?", {
                params: {
                  path: Schema.optional(Schema.String)
                }
              })
            )
        )
      const urls: Array<string> = []
      const httpClient = HttpClient.make((request, url) =>
        Effect.sync(() => {
          urls.push(url.toString())
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
        })
      )
      const client = yield* HttpApiClient.makeWith(Api, {
        httpClient,
        baseUrl: "https://api.example.com"
      })

      yield* client.files.download({
        params: {},
        responseMode: "response-only"
      })
      yield* client.files.download({
        params: { path: "a/b" },
        responseMode: "response-only"
      })

      strictEqual(urls[0], "https://api.example.com/files")
      strictEqual(urls[1], "https://api.example.com/files/a%2Fb")
    }))
})

const textEncoder = new TextEncoder()

const StreamError = Schema.Struct({ reason: Schema.String })

const Events = Schema.Struct({
  event: Schema.String,
  data: Schema.String
})

class EndpointError extends Schema.TaggedError<EndpointError>()("EndpointError", {
  message: Schema.String
}, { httpApiStatus: 400 }) {}

const MixedSuccess = Schema.Struct({
  message: Schema.String
})

const MixedEventData = Schema.Struct({
  text: Schema.String
})

const StreamingApi = HttpApi.make("StreamingApi").add(
  HttpApiGroup.make("test")
    .add(
      HttpApiEndpoint.get("events", "/events", {
        success: HttpApiSchema.StreamSse({ events: Events, error: StreamError }),
        error: EndpointError
      }),
      HttpApiEndpoint.get("download", "/download", {
        success: HttpApiSchema.StreamUint8Array(),
        error: EndpointError
      })
    )
)

const AnnotatedStreamingApi = HttpApi.make("AnnotatedStreamingApi").add(
  HttpApiGroup.make("test")
    .add(
      HttpApiEndpoint.get("events", "/events", {
        success: HttpApiSchema.status(202)(HttpApiSchema.StreamSse({ events: Events, error: StreamError }))
      }),
      HttpApiEndpoint.get("download", "/download", {
        success: HttpApiSchema.status(206)(HttpApiSchema.StreamUint8Array())
      })
    )
)

const MixedSuccessApi = HttpApi.make("MixedSuccessApi").add(
  HttpApiGroup.make("test")
    .add(
      HttpApiEndpoint.get("chat", "/chat", {
        success: [
          MixedSuccess,
          HttpApiSchema.StreamSse({ data: MixedEventData, error: StreamError })
        ]
      })
    )
)

const JsonResponseError = Schema.Struct({
  _tag: Schema.Literal("JsonError"),
  message: Schema.String
}).pipe(HttpApiSchema.status(400))

const TextResponseError = Schema.String.pipe(
  HttpApiSchema.asText(),
  HttpApiSchema.status(400)
)

const NoContentResponseError = Schema.Literal("NoContentError").pipe(
  HttpApiSchema.asNoContent({ decode: () => "NoContentError" as const }),
  HttpApiSchema.status(400)
)

const FirstJsonResponseError = Schema.Struct({
  _tag: Schema.Literal("FirstJsonError"),
  code: Schema.Number
}).pipe(
  HttpApiSchema.asJson({ contentType: "Application/Problem+JSON" }),
  HttpApiSchema.status(400)
)

const SecondJsonResponseError = Schema.Struct({
  _tag: Schema.Literal("SecondJsonError"),
  message: Schema.String
}).pipe(
  HttpApiSchema.asJson({ contentType: "application/problem+json; charset=utf-8" }),
  HttpApiSchema.status(400)
)

const ErrorContentTypeApi = HttpApi.make("ErrorContentTypeApi").add(
  HttpApiGroup.make("test")
    .add(
      HttpApiEndpoint.get("textFirst", "/text-first", {
        error: [TextResponseError, JsonResponseError]
      }),
      HttpApiEndpoint.get("jsonFirst", "/json-first", {
        error: [JsonResponseError, TextResponseError]
      }),
      HttpApiEndpoint.get("noContent", "/no-content", {
        error: [NoContentResponseError, TextResponseError]
      }),
      HttpApiEndpoint.get("equivalentJson", "/equivalent-json", {
        error: [FirstJsonResponseError, SecondJsonResponseError]
      })
    )
)

const clientFromResponse = (response: () => Response): HttpClient.HttpClient =>
  HttpClient.make((request): Effect.Effect<HttpClientResponse.HttpClientResponse, never, never> =>
    Effect.succeed(HttpClientResponse.fromWeb(request, response()))
  )

const textStream = (chunks: ReadonlyArray<string>): ReadableStream<Uint8Array> => {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) {
        controller.close()
      } else {
        controller.enqueue(textEncoder.encode(chunks[index++]!))
      }
    }
  })
}

const byteStream = (chunks: ReadonlyArray<Uint8Array>): ReadableStream<Uint8Array> => {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) {
        controller.close()
      } else {
        controller.enqueue(chunks[index++]!)
      }
    }
  })
}
