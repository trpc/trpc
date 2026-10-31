import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiSchema, OpenApi } from "effect/http-api"

const Events = Schema.Struct({
  event: Schema.Literal("user.created"),
  data: Schema.String
})
const StreamError = Schema.Struct({ reason: Schema.String })

const sse = () => HttpApiSchema.StreamSse({ events: Events, error: StreamError })

describe("HttpApiEndpoint", () => {
  it("omits undefined optional HTTP properties", () => {
    const endpoint = HttpApiEndpoint.get("get", "/", {
      query: {
        search: Schema.optional(Schema.String),
        absent: Schema.optional(Schema.Undefined)
      }
    })
    const schema = endpoint.query as typeof endpoint["~Query"]

    assert.deepStrictEqual(Schema.encodeSync(schema)({ search: undefined, absent: undefined }), {})
    assert.deepStrictEqual(Schema.encodeSync(schema)({ search: "value" }), { search: "value" })
  })

  it("stores the supplied identifier", () => {
    const endpoint = HttpApiEndpoint.get("getUser", "/users/:id")

    assert.strictEqual(endpoint.identifier, "getUser")
  })

  it("can be extended as a class", () => {
    const endpoint = HttpApiEndpoint.get("getUser", "/users/:id")
    class GetUser extends endpoint {}

    assert.strictEqual(typeof endpoint, "function")
    assert.strictEqual(GetUser.name, "GetUser")
    assert.strictEqual(GetUser.identifier, "getUser")
    assert.isTrue(HttpApiEndpoint.isHttpApiEndpoint(GetUser))

    const prefixed = GetUser.prefix("/v1")
    assert.strictEqual(prefixed.identifier, "getUser")
    assert.strictEqual(prefixed.path, "/v1/users/:id")
  })
})

describe("HttpApiEndpoint payload schemas", () => {
  it("normalizes payload map keys while preserving the declared content type", () => {
    const contentType = "Application/Vnd.Effect+JSON; Charset=UTF-8"
    const endpoint = HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: Schema.String }).pipe(HttpApiSchema.asJson({ contentType }))
    })

    const entry = endpoint.payload.get("application/vnd.effect+json")
    assert.isDefined(entry)
    assert.strictEqual(entry.encoding.contentType, contentType)
  })

  it("rejects incompatible encodings for equivalent content types", () => {
    const JsonPayload = Schema.Struct({ name: Schema.String }).pipe(
      HttpApiSchema.asJson({ contentType: "Application/Vnd.Effect+Data; charset=utf-8" })
    )
    const TextPayload = Schema.String.pipe(
      HttpApiSchema.asText({ contentType: "application/vnd.effect+data" })
    )

    assert.throws(
      () => HttpApiEndpoint.post("create", "/", { payload: [JsonPayload, TextPayload] }),
      /Multiple payload encodings/
    )
  })
})

describe("HttpApiEndpoint streaming payload schemas", () => {
  it("rejects two streaming payloads", () => {
    assert.throws(
      () =>
        HttpApiEndpoint.post("upload", "/upload", {
          payload: [
            HttpApiSchema.StreamNdjson({ schema: Schema.Number }),
            HttpApiSchema.StreamUint8Array()
          ]
        }),
      /Multiple streaming payloads/
    )
  })

  it("rejects buffered payloads and successes on any listed stream content type", () => {
    const stream = HttpApiSchema.StreamNdjson({
      schema: Schema.Number,
      contentType: ["application/x-ndjson", "application/json"]
    })

    assert.throws(
      () => HttpApiEndpoint.post("upload", "/upload", { payload: [stream, Schema.Struct({ ok: Schema.Boolean })] }),
      /Cannot combine buffered and streaming payloads for content-type: application\/json/
    )
    assert.throws(
      () => HttpApiEndpoint.get("export", "/export", { success: [stream, Schema.Struct({ ok: Schema.Boolean })] }),
      /Cannot combine buffered and streaming success responses for status 200 and content-type: application\/json/
    )
  })

  it("rejects streaming payloads on no-body methods", () => {
    const payload: any = HttpApiSchema.StreamUint8Array()
    assert.throws(() => HttpApiEndpoint.get("upload", "/upload", { payload }), /GET/)
  })
})

describe("HttpApiEndpoint streaming success schemas", () => {
  it("GET endpoint accepts StreamSse success", () => {
    const stream = sse()
    const endpoint = HttpApiEndpoint.get("events", "/events", {
      success: stream
    })

    assert.isTrue(endpoint.success.has(stream))
  })

  it("GET endpoint accepts StreamUint8Array success", () => {
    const stream = HttpApiSchema.StreamUint8Array()
    const endpoint = HttpApiEndpoint.get("download", "/download", {
      success: stream
    })

    assert.isTrue(endpoint.success.has(stream))
  })

  it("streaming schema in error throws during endpoint construction", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        error: sse() as any
      })
    )
  })

  it("HEAD with streaming success throws", () => {
    assert.throws(() =>
      HttpApiEndpoint.head("events", "/events", {
        success: sse()
      })
    )
  })

  it("streaming success mixed with NoContent at the same status throws", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: [
          sse(),
          HttpApiSchema.NoContent.pipe(HttpApiSchema.status(200))
        ]
      })
    )
  })

  it("streaming success mixed with a buffered success at the same status is allowed for distinct content types", () => {
    const stream = sse()
    const endpoint = HttpApiEndpoint.get("events", "/events", {
      success: [
        stream,
        Schema.Struct({ ok: Schema.Boolean })
      ]
    })

    assert.isTrue(endpoint.success.has(stream))
  })

  it("streaming success mixed with a buffered success at the same content type throws", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: [
          HttpApiSchema.StreamSse({ contentType: "application/json", events: Events, error: StreamError }),
          Schema.Struct({ ok: Schema.Boolean })
        ]
      })
    )
  })

  it("streaming success mixed with a buffered success at content types differing only by parameters throws", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: [
          HttpApiSchema.StreamSse({
            contentType: "application/json; charset=utf-8",
            events: Events,
            error: StreamError
          }),
          Schema.Struct({ ok: Schema.Boolean })
        ]
      })
    )
  })

  it("streaming success mixed with a buffered success at distinct statuses is allowed", () => {
    const stream = HttpApiSchema.status(206)(sse())
    const endpoint = HttpApiEndpoint.get("events", "/events", {
      success: [
        stream,
        Schema.Struct({ ok: Schema.Boolean })
      ]
    })

    assert.isTrue(endpoint.success.has(stream))
  })

  it("streaming success mixed with NoContent at distinct statuses is allowed", () => {
    const stream = HttpApiSchema.status(200)(sse())
    const endpoint = HttpApiEndpoint.get("events", "/events", {
      success: [
        stream,
        HttpApiSchema.NoContent
      ]
    })

    assert.isTrue(endpoint.success.has(stream))
  })

  it("two streaming successes for the same status throw", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: [
          sse(),
          HttpApiSchema.StreamUint8Array({ contentType: "application/custom-stream" })
        ]
      })
    )
  })

  it("two streaming successes for distinct statuses throw", () => {
    const stream = HttpApiSchema.status(206)(sse())
    const bytes = HttpApiSchema.status(200)(
      HttpApiSchema.StreamUint8Array({ contentType: "application/custom-stream" })
    )

    assert.throws(
      () => HttpApiEndpoint.get("events", "/events", { success: [stream, bytes] }),
      "Multiple streaming success responses are not supported"
    )
  })

  it("statically detectable SSE reserved failure event name throws", () => {
    const stream = HttpApiSchema.StreamSse({
      events: Schema.Struct({
        event: Schema.Literal("effect/http-api/stream/failure"),
        data: Schema.String
      }),
      error: StreamError
    })

    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: stream
      })
    )
  })
})

describe("HttpApiEndpoint WithHeaders schemas", () => {
  it("rejects a WithHeaders success sharing its status and content type", () => {
    assert.throws(
      () =>
        HttpApiEndpoint.get("get", "/", {
          success: [
            Schema.Struct({ plain: Schema.String }),
            HttpApiSchema.WithHeaders(
              Schema.Struct({ wrapped: Schema.String }),
              { "x-trace-id": Schema.String }
            )
          ]
        }),
      "Cannot combine a response with headers with another response for status 200 and content-type: application/json"
    )
  })

  it("rejects an encodeToWithHeaders error sharing its status and content type", () => {
    const ErrorWithHeaders = Schema.String.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: Schema.Struct({ wrapped: Schema.String }),
        headers: { "x-trace-id": Schema.String }
      }, {
        decode: ({ body }) => body.wrapped,
        encode: (message) => ({ body: { wrapped: message }, headers: { "x-trace-id": "trace" } })
      })
    )

    assert.throws(
      () =>
        HttpApiEndpoint.get("get", "/", {
          error: [
            Schema.Struct({ plain: Schema.String }),
            ErrorWithHeaders
          ]
        }),
      "Cannot combine a response with headers with another response for status 500 and content-type: application/json"
    )
  })

  it("rejects two WithHeaders successes sharing a status across content types", () => {
    assert.throws(
      () =>
        HttpApiEndpoint.get("get", "/", {
          success: [
            HttpApiSchema.WithHeaders(
              Schema.Struct({ value: Schema.String }),
              { "x-json": Schema.String }
            ),
            HttpApiSchema.WithHeaders(
              Schema.String.pipe(HttpApiSchema.asText()),
              { "x-text": Schema.String }
            )
          ]
        }),
      "Cannot declare multiple responses with headers for status 200"
    )
  })

  it("rejects two encodeToWithHeaders errors sharing a status", () => {
    const JsonError = Schema.String.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: Schema.Struct({ message: Schema.String }),
        headers: { "x-json": Schema.String }
      }, {
        decode: ({ body }) => body.message,
        encode: (message) => ({ body: { message }, headers: { "x-json": "json" } })
      })
    )
    const TextError = Schema.String.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: Schema.String.pipe(HttpApiSchema.asText()),
        headers: { "x-text": Schema.String }
      }, {
        decode: ({ body }) => body,
        encode: (message) => ({ body: message, headers: { "x-text": "text" } })
      })
    )

    assert.throws(
      () => HttpApiEndpoint.get("get", "/", { error: [JsonError, TextError] }),
      "Cannot declare multiple responses with headers for status 500"
    )
  })

  it("rejects mixed WithHeaders and encodeToWithHeaders responses sharing a status", () => {
    const AnnotatedError = Schema.String.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: Schema.String.pipe(HttpApiSchema.status(429), HttpApiSchema.asText()),
        headers: { "retry-after": Schema.String }
      }, {
        decode: ({ body }) => body,
        encode: (message) => ({ body: message, headers: { "retry-after": "30" } })
      })
    )

    assert.throws(
      () =>
        HttpApiEndpoint.get("get", "/", {
          error: [
            HttpApiSchema.WithHeaders(
              Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(429)),
              { "x-trace-id": Schema.String }
            ),
            AnnotatedError
          ]
        }),
      "Cannot declare multiple responses with headers for status 429"
    )
  })

  it("allows one response with headers and a plain response for the same status across content types", () => {
    const endpoint = HttpApiEndpoint.get("get", "/", {
      success: [
        HttpApiSchema.WithHeaders(
          Schema.Struct({ value: Schema.String }),
          { "x-trace-id": Schema.String }
        ),
        Schema.String.pipe(HttpApiSchema.asText())
      ]
    })

    assert.strictEqual(endpoint.success.size, 2)
  })

  it("allows responses with headers on distinct statuses", () => {
    const endpoint = HttpApiEndpoint.get("get", "/", {
      success: [
        HttpApiSchema.WithHeaders(
          Schema.Struct({ value: Schema.String }),
          { "x-trace-id": Schema.String }
        ),
        HttpApiSchema.WithHeaders(
          Schema.Struct({ created: Schema.Boolean }).pipe(HttpApiSchema.status(201)),
          { location: Schema.String }
        )
      ]
    })

    assert.strictEqual(endpoint.success.size, 2)
  })

  it("keeps the wrapper in the success set with codec-transformed parts", () => {
    const endpoint = HttpApiEndpoint.get("list", "/users", {
      success: HttpApiSchema.WithHeaders(Schema.Struct({ a: Schema.String }), {
        "x-count": Schema.Int
      })
    })

    const [schema] = Array.from(endpoint.success)
    assert.isTrue(HttpApiSchema.isWithHeaders(schema))
    if (HttpApiSchema.isWithHeaders(schema)) {
      assert.deepStrictEqual(
        Schema.encodeSync(schema.headers as any)({ "x-count": 3 }),
        { "x-count": "3" }
      )
    }
  })

  it("leaves the wrapper untouched when codecs are disabled", () => {
    const wrapped = HttpApiSchema.WithHeaders(Schema.Struct({ a: Schema.String }), {
      "x-count": Schema.Int
    })
    const endpoint = HttpApiEndpoint.get("list", "/users", {
      disableCodecs: true,
      success: wrapped
    })

    assert.isTrue(endpoint.success.has(wrapped))
  })

  it("preserves disableCodecs through derived endpoints", () => {
    const endpoint = HttpApiEndpoint.get("list", "/users", {
      disableCodecs: true,
      success: Schema.Struct({ a: Schema.String })
    })

    assert.isTrue(endpoint.disableCodecs)
    assert.isTrue(endpoint.prefix("/api").disableCodecs)
    assert.isTrue(endpoint.annotate(OpenApi.Title, "Users").disableCodecs)
    assert.isFalse(HttpApiEndpoint.get("plain", "/plain").disableCodecs)
  })

  it("keeps a wrapped stream schema as the inner schema", () => {
    const stream = sse()
    const endpoint = HttpApiEndpoint.get("events", "/events", {
      success: HttpApiSchema.WithHeaders(stream, { "x-count": Schema.Int })
    })

    const [schema] = Array.from(endpoint.success)
    assert.isTrue(HttpApiSchema.isWithHeaders(schema))
    if (HttpApiSchema.isWithHeaders(schema)) {
      assert.strictEqual(schema.schema, stream)
    }
  })

  it("preserves wrapper annotations through endpoint construction", () => {
    const endpoint = HttpApiEndpoint.get("list", "/users", {
      success: HttpApiSchema.WithHeaders(Schema.Struct({ a: Schema.String }), {
        "x-count": Schema.Int
      }).pipe(HttpApiSchema.status(201))
    })

    const [schema] = Array.from(endpoint.success)
    assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(schema), 201)
  })

  it("validates a wrapped stream like a bare stream", () => {
    assert.throws(() =>
      HttpApiEndpoint.get("events", "/events", {
        success: [
          HttpApiSchema.WithHeaders(sse(), { "x-count": Schema.Int }),
          HttpApiSchema.StreamUint8Array({ contentType: "application/custom-stream" })
        ]
      })
    )
    assert.throws(() =>
      HttpApiEndpoint.head("events", "/events", {
        success: HttpApiSchema.WithHeaders(sse(), { "x-count": Schema.Int }) as any
      })
    )
  })

  it("rejects wrapped and bare streams at distinct statuses", () => {
    assert.throws(
      () =>
        HttpApiEndpoint.get("events", "/events", {
          success: [
            HttpApiSchema.status(206)(
              HttpApiSchema.StreamUint8Array({ contentType: "application/custom-bytes" })
            ),
            HttpApiSchema.WithHeaders(
              HttpApiSchema.status(201)(
                HttpApiSchema.StreamUint8Array({ contentType: "application/other-bytes" })
              ),
              { "x-source": Schema.String }
            )
          ]
        }),
      "Multiple streaming success responses are not supported"
    )

    assert.throws(
      () =>
        HttpApiEndpoint.get("events", "/events", {
          success: [
            HttpApiSchema.WithHeaders(sse(), { "x-count": Schema.Int }),
            sse()
          ]
        }),
      "Multiple streaming success responses are not supported"
    )
  })

  it("keeps WithHeaders in the error set with codec-transformed parts", () => {
    const endpoint = HttpApiEndpoint.get("list", "/users", {
      error: HttpApiSchema.WithHeaders(
        Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(429)),
        { "retry-after": Schema.Int }
      )
    })

    const [schema] = Array.from(endpoint.error)
    assert.isTrue(HttpApiSchema.isWithHeaders(schema))
    assert.strictEqual(HttpApiSchema.getStatusErrorSchema(schema), 429)
    if (HttpApiSchema.isWithHeaders(schema)) {
      assert.deepStrictEqual(
        Schema.encodeSync(schema.headers as any)({ "retry-after": 30 }),
        { "retry-after": "30" }
      )
    }
  })

  describe("Upgrade", () => {
    const upgrade = HttpApiSchema.Upgrade({ protocol: "tcp" })

    it.each([
      { name: "a no-content response", success: HttpApiSchema.Empty(200) },
      { name: "a buffered response", success: Schema.String }
    ])("accepts an upgrade with $name", ({ success }) => {
      const endpoint = HttpApiEndpoint.post("start", "/start", { success: [upgrade, success] })

      assert.deepStrictEqual(Array.from(endpoint.success).map(HttpApiSchema.isUpgrade), [true, false])
    })

    it.each([
      {
        name: "with another upgrade",
        make: () =>
          HttpApiEndpoint.post("attach", "/attach", {
            success: [upgrade, HttpApiSchema.Upgrade({ protocol: "h2c" })]
          }),
        message: "Cannot declare more than one upgrade"
      },
      {
        name: "with a streaming success",
        make: () => HttpApiEndpoint.post("attach", "/attach", { success: [upgrade, sse()] }),
        message: "Cannot combine an upgrade with a streaming success response"
      },
      {
        name: "with another success at status 101",
        make: () =>
          HttpApiEndpoint.post("attach", "/attach", {
            success: [upgrade, Schema.String.pipe(HttpApiSchema.status(101))]
          }),
        message: "Cannot combine an upgrade with another success response for status: 101"
      },
      {
        name: "wrapped in WithHeaders",
        make: () =>
          HttpApiEndpoint.post("attach", "/attach", {
            success: HttpApiSchema.WithHeaders(upgrade, { "x-id": Schema.String })
          }),
        message: "WithHeaders cannot wrap an upgrade"
      },
      {
        name: "wrapped by encodeToWithHeaders",
        make: () =>
          upgrade.pipe(
            HttpApiSchema.encodeToWithHeaders(
              { body: upgrade, headers: { "x-id": Schema.String } },
              { decode: ({ body }) => body, encode: (body) => ({ body, headers: { "x-id": "id" } }) }
            )
          ),
        message: "encodeToWithHeaders cannot wrap an upgrade"
      },
      {
        name: "on HEAD",
        make: () => HttpApiEndpoint.head("attach", "/attach", { success: upgrade }),
        message: "HEAD endpoints cannot declare an upgrade"
      },
      {
        name: "with a byte stream payload",
        make: () =>
          HttpApiEndpoint.post("attach", "/attach", { payload: HttpApiSchema.StreamUint8Array(), success: upgrade }),
        message: "Upgrade endpoints cannot declare a streaming payload"
      },
      {
        name: "with a multipart stream payload",
        make: () =>
          HttpApiEndpoint.post("attach", "/attach", {
            payload: Schema.Struct({ file: Schema.String }).pipe(HttpApiSchema.asMultipartStream()),
            success: upgrade
          }),
        message: "Upgrade endpoints cannot declare a streaming payload"
      },
      {
        name: "as an error",
        make: () => HttpApiEndpoint.post("attach", "/attach", { error: upgrade as any }),
        message: "Upgrade schemas are not supported in error responses"
      },
      {
        name: "to WebSocket",
        make: () => HttpApiSchema.Upgrade({ protocol: "WebSocket" }),
        message: "Upgrade does not support WebSocket"
      }
    ])("rejects an upgrade $name", ({ make, message }) => {
      assert.throws(make, message)
    })
  })
})
