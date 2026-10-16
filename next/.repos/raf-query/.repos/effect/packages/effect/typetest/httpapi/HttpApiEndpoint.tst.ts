import { type Effect, hole, Schema, type Stream, Struct } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiMiddleware, HttpApiSchema } from "effect/http-api"
import type { HttpServerResponse } from "effect/http/HttpServerResponse"
import { describe, expect, it } from "tstyche"

describe("HttpApiEndpoint", () => {
  describe("isHttpApiEndpoint", () => {
    it("narrows to Top", () => {
      const value: unknown = HttpApiEndpoint.get("a", "/a")

      if (HttpApiEndpoint.isHttpApiEndpoint(value)) {
        expect(value).type.toBe<HttpApiEndpoint.Top>()
      }
    })
  })

  describe("Identifier", () => {
    it("extracts endpoint identifiers", () => {
      const a = HttpApiEndpoint.get("a", "/a")
      const b = HttpApiEndpoint.get("b", "/b")

      expect<HttpApiEndpoint.Identifier<typeof a>>().type.toBe<"a">()
      expect<HttpApiEndpoint.Identifier<typeof a | typeof b>>().type.toBe<"a" | "b">()
    })

    it("exposes the identifier literal", () => {
      const endpoint = HttpApiEndpoint.get("getUser", "/users/:id")

      expect(endpoint.identifier).type.toBe<"getUser">()
    })
  })

  describe("class extension", () => {
    it("supports extending an endpoint as a class", () => {
      class GetUser extends HttpApiEndpoint.get("getUser", "/users/:id") {}

      expect(GetUser.identifier).type.toBe<"getUser">()
      expect<HttpApiEndpoint.Identifier<typeof GetUser>>().type.toBe<"getUser">()
      expect(GetUser.prefix("/v1").path).type.toBe<"/v1/users/:id">()
    })
  })

  describe("params", () => {
    it("defaults to never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a")
      expect(endpoint["~Params"]).type.toBe<never>()
    })

    it("accepts a field record", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        params: {
          id: Schema.Finite
        }
      })
      expect(endpoint["~Params"]).type.toBe<
        Schema.toCodecStringTree<
          Schema.Struct<{ id: Schema.Finite }>
        >
      >()
    })

    it("accepts a Struct schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        params: Schema.Struct({ a: Schema.Finite, b: Schema.Finite })
      })
      expect(endpoint["~Params"]).type.toBe<
        Schema.toCodecStringTree<
          Schema.Struct<{ readonly a: Schema.Finite; readonly b: Schema.Finite }>
        >
      >()
    })
  })

  describe("query", () => {
    it("defaults to never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a")
      expect(endpoint["~Query"]).type.toBe<never>()
    })

    it("accepts a field record", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        query: {
          id: Schema.Finite
        }
      })
      expect(endpoint["~Query"]).type.toBe<Schema.toCodecStringTree<Schema.Struct<{ id: Schema.Finite }>>>()
    })

    it("accepts a Struct record", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        query: Struct.Record(["a", "b"], Schema.Finite)
      })
      expect(endpoint["~Query"]).type.toBe<
        Schema.toCodecStringTree<Schema.Struct<{ a: Schema.Finite; b: Schema.Finite }>>
      >()
    })

    it("accepts a Struct schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        query: Schema.Struct({ a: Schema.Finite, b: Schema.Finite })
      })
      expect(endpoint["~Query"]).type.toBe<
        Schema.toCodecStringTree<
          Schema.Struct<{ readonly a: Schema.Finite; readonly b: Schema.Finite }>
        >
      >()
    })
  })

  describe("headers", () => {
    it("defaults to never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a")
      expect(endpoint["~Headers"]).type.toBe<never>()
    })

    it("accepts a field record", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        headers: {
          id: Schema.FiniteFromString
        }
      })
      expect(endpoint["~Headers"]).type.toBe<
        Schema.toCodecStringTree<Schema.Struct<{ id: Schema.FiniteFromString }>>
      >()
    })

    it("accepts a Struct schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        headers: Schema.Struct({ a: Schema.FiniteFromString, b: Schema.FiniteFromString })
      })
      expect(endpoint["~Headers"]).type.toBe<
        Schema.toCodecStringTree<
          Schema.Struct<{ readonly a: Schema.FiniteFromString; readonly b: Schema.FiniteFromString }>
        >
      >()
    })
  })

  describe("payload", () => {
    it("defaults to never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a")
      expect(endpoint["~Payload"]).type.toBe<never>()
    })

    describe("GET", () => {
      it("accepts a field record", () => {
        const endpoint = HttpApiEndpoint.get("a", "/a", {
          payload: {
            id: Schema.Finite
          }
        })
        expect(endpoint["~Payload"]).type.toBe<Schema.toCodecStringTree<Schema.Struct<{ id: Schema.Finite }>>>()
      })

      it("rejects non-field schemas", () => {
        expect(HttpApiEndpoint.get).type.not.toBeCallableWith("a", "/a", {
          payload: Schema.Struct({ id: Schema.String })
        })
      })
    })

    describe("POST", () => {
      it("accepts a schema", () => {
        const endpoint = HttpApiEndpoint.post("a", "/a", {
          payload: Schema.Struct({ a: Schema.String })
        })
        expect(endpoint["~Payload"]).type.toBe<
          Schema.toCodecJson<Schema.Struct<{ readonly a: Schema.String }>>
        >()
      })

      it("accepts multiple schemas", () => {
        const endpoint = HttpApiEndpoint.post("a", "/a", {
          payload: [
            Schema.Struct({ a: Schema.String }), // application/json
            Schema.String.pipe(HttpApiSchema.asText()), // text/plain
            Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
          ]
        })
        expect(endpoint["~Payload"]).type.toBe<
          Schema.toCodecJson<
            Schema.String | Schema.Struct<{ readonly a: Schema.String }> | Schema.Uint8Array
          >
        >()
      })
    })

    describe("QUERY", () => {
      it("accepts a body schema", () => {
        const endpoint = HttpApiEndpoint.query("a", "/a", {
          payload: Schema.Struct({ a: Schema.String })
        })
        expect(endpoint.method).type.toBe<"QUERY">()
        expect(endpoint["~Payload"]).type.toBe<
          Schema.toCodecJson<Schema.Struct<{ readonly a: Schema.String }>>
        >()
      })
    })

    describe("HEAD", () => {
      it("accepts a field record", () => {
        const endpoint = HttpApiEndpoint.head("a", "/a", {
          payload: {
            id: Schema.Finite
          }
        })
        expect(endpoint["~Payload"]).type.toBe<Schema.toCodecStringTree<Schema.Struct<{ id: Schema.Finite }>>>()
      })

      it("rejects non-field schemas", () => {
        expect(HttpApiEndpoint.head).type.not.toBeCallableWith("a", "/a", {
          payload: Schema.Struct({ id: Schema.String })
        })
      })
    })

    describe("OPTIONS", () => {
      it("accepts a field record", () => {
        const endpoint = HttpApiEndpoint.options("a", "/a", {
          payload: {
            id: Schema.Finite
          }
        })
        expect(endpoint["~Payload"]).type.toBe<Schema.toCodecStringTree<Schema.Struct<{ id: Schema.Finite }>>>()
      })

      it("rejects non-field schemas", () => {
        expect(HttpApiEndpoint.options).type.not.toBeCallableWith("a", "/a", {
          payload: Schema.Struct({ id: Schema.String })
        })
      })
    })
  })

  describe("disableCodecs", () => {
    it("leaves omitted request parts as never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        disableCodecs: true
      })

      expect(endpoint["~Params"]).type.toBe<never>()
      expect(endpoint["~Query"]).type.toBe<never>()
      expect(endpoint["~Headers"]).type.toBe<never>()
      expect(endpoint["~Payload"]).type.toBe<never>()
    })

    it("preserves request schemas without codec wrappers", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        disableCodecs: true,
        params: {
          id: Schema.FiniteFromString
        },
        query: {
          page: Schema.FiniteFromString
        },
        headers: {
          authorization: Schema.String
        },
        payload: Schema.Struct({ body: Schema.String })
      })

      expect(endpoint["~Params"]).type.toBe<Schema.Struct<{ id: Schema.FiniteFromString }>>()
      expect(endpoint["~Query"]).type.toBe<Schema.Struct<{ page: Schema.FiniteFromString }>>()
      expect(endpoint["~Headers"]).type.toBe<Schema.Struct<{ authorization: Schema.String }>>()
      expect(endpoint["~Payload"]).type.toBe<Schema.Struct<{ readonly body: Schema.String }>>()
    })
  })

  describe("request and handler types", () => {
    it("derives decoded request parts with Request", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        params: {
          id: Schema.String
        },
        query: {
          page: Schema.FiniteFromString
        },
        headers: {
          authorization: Schema.String
        },
        payload: Schema.Struct({
          name: Schema.String
        }),
        success: Schema.String
      })

      type Request = HttpApiEndpoint.Request<typeof endpoint>

      expect<Request["params"]>().type.toBe<{ readonly id: string }>()
      expect<Request["query"]>().type.toBe<{ readonly page: number }>()
      expect<Request["headers"]>().type.toBe<{ readonly authorization: string }>()
      expect<Request["payload"]>().type.toBe<{ readonly name: string }>()
      expect<Request["endpoint"]>().type.toBe<typeof endpoint>()
    })

    it("omits the payload from RequestRaw", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        params: {
          id: Schema.String
        },
        payload: Schema.Struct({
          name: Schema.String
        }),
        success: Schema.String
      })

      type Request = HttpApiEndpoint.RequestRaw<typeof endpoint>

      expect<Request["params"]>().type.toBe<{ readonly id: string }>()
      expect<Request>().type.not.toHaveProperty("payload")
      expect<Request["endpoint"]>().type.toBe<typeof endpoint>()
    })

    it("passes decoded request parts to Handler", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        params: {
          id: Schema.String
        },
        query: {
          page: Schema.FiniteFromString
        },
        headers: {
          authorization: Schema.String
        },
        payload: Schema.Struct({
          name: Schema.String
        }),
        success: Schema.String
      })

      type Request = Parameters<HttpApiEndpoint.Handler<typeof endpoint, never, never>>[0]

      expect<Request["params"]>().type.toBe<{ readonly id: string }>()
      expect<Request["query"]>().type.toBe<{ readonly page: number }>()
      expect<Request["headers"]>().type.toBe<{ readonly authorization: string }>()
      expect<Request["payload"]>().type.toBe<{ readonly name: string }>()
      expect<Request["endpoint"]>().type.toBe<typeof endpoint>()
    })

    it("omits the payload from HandlerRaw requests", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        params: {
          id: Schema.String
        },
        payload: Schema.Struct({
          name: Schema.String
        }),
        success: Schema.String
      })

      type Request = Parameters<HttpApiEndpoint.HandlerRaw<typeof endpoint, never, never>>[0]

      expect<Request["params"]>().type.toBe<{ readonly id: string }>()
      expect<Request>().type.not.toHaveProperty("payload")
      expect<Request["endpoint"]>().type.toBe<typeof endpoint>()
    })
  })

  describe("success", () => {
    it("defaults to HttpApiSchema.NoContent", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a")
      expect(endpoint["~Success"]).type.toBe<Schema.toCodecJson<typeof HttpApiSchema.NoContent>>()
    })

    it("applies the JSON codec to a schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.Struct({ a: Schema.String })
      })
      expect(endpoint["~Success"]).type.toBe<Schema.toCodecJson<Schema.Struct<{ readonly a: Schema.String }>>>()
    })

    it("applies the JSON codec to multiple buffered schemas", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: [
          Schema.Struct({ a: Schema.String }), // application/json
          Schema.String.pipe(HttpApiSchema.asText()), // text/plain
          Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
        ]
      })
      expect(endpoint["~Success"]).type.toBe<
        Schema.toCodecJson<Schema.String | Schema.Struct<{ readonly a: Schema.String }> | Schema.Uint8Array>
      >()
    })

    it("preserves mixed buffered and stream schemas", () => {
      const stream = HttpApiSchema.StreamSse({
        data: Schema.Struct({ token: Schema.String }),
        error: Schema.Struct({ reason: Schema.String })
      })
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: [
          Schema.Struct({ message: Schema.String }),
          stream
        ]
      })

      expect(endpoint["~Success"]).type.toBe<
        | Schema.toCodecJson<Schema.Struct<{ readonly message: Schema.String }>>
        | typeof stream
      >()
    })

    it("preserves StreamSse schemas", () => {
      const stream = HttpApiSchema.StreamSse({
        events: Schema.Struct({
          event: Schema.Literal("user.created"),
          data: Schema.String
        }),
        error: Schema.Struct({ reason: Schema.String })
      })
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: stream
      })
      expect(endpoint["~Success"]).type.toBe<typeof stream>()
    })

    it("maps StreamSse to stream success and handler types", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({
          events: Schema.Struct({
            event: Schema.Literal("user.created"),
            data: Schema.String
          }),
          error: Schema.Struct({ reason: Schema.String })
        })
      })

      type Event = { readonly event: "user.created"; readonly data: string }
      type StreamError = { readonly reason: string }
      type Success = Stream.Stream<Event, StreamError>

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
      expect<ReturnType<HttpApiEndpoint.HandlerRaw<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("maps StreamSse data mode to data stream and handler types", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({
          data: Schema.Struct({ id: Schema.String }),
          error: Schema.Struct({ reason: Schema.String })
        })
      })

      type Data = { readonly id: string }
      type StreamError = { readonly reason: string }
      type Success = Stream.Stream<Data, StreamError>

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("maps an omitted StreamSse error schema to never", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({
          data: Schema.Struct({ id: Schema.String })
        })
      })

      type Data = { readonly id: string }
      type Success = Stream.Stream<Data, never>

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("preserves StreamUint8Array schemas", () => {
      const stream = HttpApiSchema.StreamUint8Array()
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: stream
      })
      expect(endpoint["~Success"]).type.toBe<typeof stream>()
    })

    it("applies the JSON and string-tree codecs to WithHeaders parts", () => {
      const Body = Schema.Struct({ a: Schema.String })
      const Headers = Schema.Struct({ "x-count": Schema.Int })
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.WithHeaders(Body, Headers)
      })

      expect(endpoint["~Success"]).type.toBe<
        HttpApiSchema.WithHeaders<Schema.toCodecJson<typeof Body>, Schema.toCodecStringTree<typeof Headers>>
      >()
    })

    it("maps WithHeaders to branded value success and handler types", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.WithHeaders(Schema.Struct({ a: Schema.String }), {
          "x-count": Schema.Int
        })
      })

      type Success = HttpApiSchema.withHeaders<
        { readonly a: string },
        { readonly "x-count": number }
      >

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("keeps the stream handler type for a wrapped stream schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.WithHeaders(
          HttpApiSchema.StreamSse({
            data: Schema.Struct({ id: Schema.String }),
            error: Schema.Struct({ reason: Schema.String })
          }),
          { "x-count": Schema.Int }
        )
      })

      type Success = HttpApiSchema.withHeaders<
        Stream.Stream<{ readonly id: string }, { readonly reason: string }>,
        { readonly "x-count": number }
      >

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("preserves mixed WithHeaders and plain schemas", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: [
          HttpApiSchema.WithHeaders(Schema.Struct({ a: Schema.String }), {
            "x-count": Schema.Int
          }),
          Schema.String.pipe(HttpApiSchema.status(201), HttpApiSchema.asText())
        ]
      })

      type Success =
        | HttpApiSchema.withHeaders<{ readonly a: string }, { readonly "x-count": number }>
        | string

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
    })

    it("maps StreamUint8Array to stream success and handler types", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamUint8Array()
      })

      type Success = Stream.Stream<Uint8Array, unknown>

      expect<HttpApiEndpoint.SuccessWithIdentifier<typeof endpoint, "a">>().type.toBe<Success>()
      expect<ReturnType<HttpApiEndpoint.Handler<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
      expect<ReturnType<HttpApiEndpoint.HandlerRaw<typeof endpoint, never, never>>>().type.toBe<
        Effect.Effect<Success | HttpServerResponse, never>
      >()
    })

    it("includes StreamSse event and error schema services", () => {
      type Event = { readonly event: "user.created"; readonly data: string }
      type StreamError = { readonly reason: string }

      const Events = hole<Schema.Codec<Event, Event, "EventsDecoding", "EventsEncoding">>()
      const Error = hole<Schema.Codec<StreamError, StreamError, "ErrorDecoding", "ErrorEncoding">>()
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({ events: Events, error: Error })
      })

      expect<HttpApiEndpoint.ServerServices<typeof endpoint>>().type.toBe<"EventsEncoding" | "ErrorEncoding">()
      expect<HttpApiEndpoint.ClientServices<typeof endpoint>>().type.toBe<"EventsDecoding" | "ErrorDecoding">()
    })
  })

  describe("error services", () => {
    it("includes endpoint and middleware decoding services", () => {
      type EndpointError = { readonly reason: string }
      type MiddlewareError = { readonly reason: string }

      const EndpointError = hole<Schema.Codec<EndpointError, EndpointError, "EndpointErrorDecoding", never>>()
      const MiddlewareError = hole<Schema.Codec<MiddlewareError, MiddlewareError, "MiddlewareErrorDecoding", never>>()

      class Middleware extends HttpApiMiddleware.Service<Middleware>()("Middleware", {
        error: MiddlewareError
      }) {}

      const endpoint = HttpApiEndpoint.get("a", "/a", {
        error: EndpointError
      }).middleware(Middleware)

      expect<HttpApiEndpoint.ErrorServicesDecode<typeof endpoint>>().type.toBe<
        "EndpointErrorDecoding" | "MiddlewareErrorDecoding"
      >()
    })

    it("includes endpoint and middleware encoding services", () => {
      type EndpointError = { readonly reason: string }
      type MiddlewareError = { readonly reason: string }

      const EndpointError = hole<Schema.Codec<EndpointError, EndpointError, never, "EndpointErrorEncoding">>()
      const MiddlewareError = hole<Schema.Codec<MiddlewareError, MiddlewareError, never, "MiddlewareErrorEncoding">>()

      class Middleware extends HttpApiMiddleware.Service<Middleware>()("Middleware", {
        error: MiddlewareError
      }) {}

      const endpoint = HttpApiEndpoint.get("a", "/a", {
        error: EndpointError
      }).middleware(Middleware)

      expect<HttpApiEndpoint.ErrorServicesEncode<typeof endpoint>>().type.toBe<
        "EndpointErrorEncoding" | "MiddlewareErrorEncoding"
      >()
    })
  })

  describe("error", () => {
    it("applies the JSON codec to a schema", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        error: Schema.Struct({ a: Schema.String })
      })
      expect(endpoint["~Error"]).type.toBe<
        Schema.toCodecJson<
          Schema.Struct<{ readonly a: Schema.String }>
        >
      >()
    })

    it("applies the JSON codec to multiple schemas", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        error: [
          Schema.Struct({ a: Schema.String }), // application/json
          Schema.String.pipe(HttpApiSchema.asText()), // text/plain
          Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
        ]
      })
      expect(endpoint["~Error"]).type.toBe<
        Schema.toCodecJson<
          | Schema.String
          | Schema.Struct<{ readonly a: Schema.String }>
          | Schema.Uint8Array
        >
      >()
    })

    it("combines endpoint and middleware errors", () => {
      type EndpointError = { readonly _tag: "EndpointError" }
      type MiddlewareError = { readonly _tag: "MiddlewareError" }

      const EndpointError = Schema.Struct({ _tag: Schema.Literal("EndpointError") })
      const MiddlewareError = Schema.Struct({ _tag: Schema.Literal("MiddlewareError") })

      class Middleware extends HttpApiMiddleware.Service<Middleware>()("Middleware", {
        error: MiddlewareError
      }) {}

      const endpoint = HttpApiEndpoint.get("a", "/a", {
        error: EndpointError
      }).middleware(Middleware)

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<
        EndpointError | MiddlewareError
      >()
    })

    it("preserves endpoint errors with mixed buffered and StreamSse successes", () => {
      const endpoint = HttpApiEndpoint.post("completions", "/completions", {
        payload: Schema.Struct({ prompt: Schema.String }),
        success: [
          Schema.Struct({ message: Schema.String }),
          HttpApiSchema.StreamSse({
            data: Schema.Struct({ token: Schema.String }),
            error: HttpApiError.InternalServerError
          })
        ],
        headers: {
          "x-session-affinity": Schema.optional(Schema.String)
        },
        error: [HttpApiError.BadRequest]
      })

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<HttpApiError.BadRequest>()
    })

    it("preserves a single endpoint error with a StreamSse success", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({
          data: Schema.Struct({ token: Schema.String }),
          error: HttpApiError.InternalServerError
        }),
        error: HttpApiError.BadRequest
      })

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<HttpApiError.BadRequest>()
    })

    it("preserves endpoint error unions with a StreamSse success", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamSse({
          data: Schema.Struct({ token: Schema.String }),
          error: HttpApiError.InternalServerError
        }),
        error: [HttpApiError.BadRequest, HttpApiError.Conflict]
      })

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<
        HttpApiError.BadRequest | HttpApiError.Conflict
      >()
    })

    it("preserves endpoint error unions when StreamSse is the first success", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: [
          HttpApiSchema.StreamSse({
            data: Schema.Struct({ token: Schema.String }),
            error: HttpApiError.InternalServerError
          }),
          Schema.Struct({ message: Schema.String })
        ],
        error: [HttpApiError.BadRequest, HttpApiError.Conflict]
      })

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<
        HttpApiError.BadRequest | HttpApiError.Conflict
      >()
    })

    it("preserves endpoint error unions with a StreamUint8Array success", () => {
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: HttpApiSchema.StreamUint8Array(),
        error: [HttpApiError.BadRequest, HttpApiError.Conflict]
      })

      expect<HttpApiEndpoint.Errors<typeof endpoint>>().type.toBe<
        HttpApiError.BadRequest | HttpApiError.Conflict
      >()
    })

    it("preserves endpoint errors when codecs are disabled", () => {
      const endpoint = HttpApiEndpoint.post("a", "/a", {
        disableCodecs: true,
        payload: Schema.Struct({ prompt: Schema.String }),
        success: [
          Schema.Struct({ message: Schema.String }),
          HttpApiSchema.StreamSse({
            data: Schema.Struct({ token: Schema.String }),
            error: HttpApiError.InternalServerError
          })
        ],
        error: [HttpApiError.BadRequest, HttpApiError.Conflict]
      })

      expect(endpoint["~Error"]).type.toBe<typeof HttpApiError.BadRequest | typeof HttpApiError.Conflict>()
      expect<(typeof endpoint)["~Error"]["Type"]>().type.toBe<
        HttpApiError.BadRequest | HttpApiError.Conflict
      >()
    })

    it("rejects streaming schemas", () => {
      expect(HttpApiEndpoint.get).type.not.toBeCallableWith("a", "/a", {
        error: HttpApiSchema.StreamUint8Array()
      })
      expect(HttpApiEndpoint.get).type.not.toBeCallableWith("a", "/a", {
        error: HttpApiSchema.StreamSse({
          events: Schema.Struct({
            event: Schema.Literal("user.created"),
            data: Schema.String
          }),
          error: Schema.Struct({ reason: Schema.String })
        })
      })
      expect(HttpApiEndpoint.get).type.not.toBeCallableWith("a", "/a", {
        error: [Schema.String, HttpApiSchema.StreamUint8Array()]
      })
      expect(HttpApiEndpoint.get).type.not.toBeCallableWith("a", "/a", {
        disableCodecs: true,
        error: [Schema.String, HttpApiSchema.StreamUint8Array()]
      })
    })
  })
})
