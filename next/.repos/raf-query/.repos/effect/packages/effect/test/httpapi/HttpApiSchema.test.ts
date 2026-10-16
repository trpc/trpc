import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"

const getStreamMetadata = (self: HttpApiSchema.StreamSchema) =>
  self._tag === "StreamSse" ?
    {
      mode: self.mode,
      sseMode: self.sseMode,
      contentType: self.contentType,
      events: self.events,
      error: self.error
    } :
    {
      mode: self.mode,
      contentType: self.contentType
    }

describe("HttpApiSchema", () => {
  describe("StreamSse", () => {
    it("stores default metadata", () => {
      const events = Schema.Struct({
        event: Schema.Literal("user.created"),
        data: Schema.String
      })
      const error = Schema.Struct({ reason: Schema.String })
      const stream = HttpApiSchema.StreamSse({ events, error })

      assert.isTrue(Schema.isSchema(stream))
      assert.isTrue(HttpApiSchema.isStreamSchema(stream))
      assert.isTrue(HttpApiSchema.isStreamSse(stream))
      assert.isFalse(HttpApiSchema.isStreamUint8Array(stream))
      assert.strictEqual(stream.mode, "sse")
      assert.strictEqual(stream.sseMode, "events")
      assert.strictEqual(stream.contentType, "text/event-stream")
      assert.strictEqual(stream.events, events)
      assert.strictEqual(stream.error, error)

      const metadata = getStreamMetadata(stream)
      assert.strictEqual(metadata.mode, "sse")
      assert.strictEqual(metadata.contentType, "text/event-stream")
      if (metadata.mode === "sse") {
        assert.strictEqual(metadata.sseMode, "events")
        assert.strictEqual(metadata.events, events)
        assert.strictEqual(metadata.error, error)
      }
    })

    it("stores custom content type", () => {
      const events = Schema.Struct({
        event: Schema.Literal("custom"),
        data: Schema.String
      })
      const error = Schema.String
      const stream = HttpApiSchema.StreamSse({
        contentType: "text/event-stream; charset=utf-8",
        events,
        error
      })

      assert.strictEqual(stream.contentType, "text/event-stream; charset=utf-8")
    })

    it("defaults the stream error schema to Never", () => {
      const events = Schema.Struct({
        event: Schema.Literal("custom"),
        data: Schema.String
      })
      const stream = HttpApiSchema.StreamSse({ events })

      assert.strictEqual(stream.error, Schema.Never)
    })

    it("creates an event schema from a JSON data schema", () => {
      const Data = Schema.Struct({ id: Schema.String })
      const error = Schema.Struct({ reason: Schema.String })
      const stream = HttpApiSchema.StreamSse({ data: Data, error })
      const encode = Schema.encodeUnknownSync(stream.events)
      const decode = Schema.decodeUnknownSync(stream.events)

      assert.strictEqual(stream.sseMode, "data")
      assert.deepStrictEqual(
        encode({ id: undefined, event: "user.created", data: { id: "123" } }),
        { id: undefined, event: "user.created", data: "{\"id\":\"123\"}" }
      )
      assert.deepStrictEqual(
        decode({ id: undefined, event: "user.created", data: "{\"id\":\"123\"}" }),
        { id: undefined, event: "user.created", data: { id: "123" } }
      )
    })
  })

  describe("StreamUint8Array", () => {
    it("stores default metadata", () => {
      const stream = HttpApiSchema.StreamUint8Array()

      assert.isTrue(Schema.isSchema(stream))
      assert.isTrue(HttpApiSchema.isStreamSchema(stream))
      assert.isFalse(HttpApiSchema.isStreamSse(stream))
      assert.isTrue(HttpApiSchema.isStreamUint8Array(stream))
      assert.strictEqual(stream.mode, "uint8array")
      assert.strictEqual(stream.contentType, "application/octet-stream")
      assert.deepStrictEqual(getStreamMetadata(stream), {
        mode: "uint8array",
        contentType: "application/octet-stream"
      })
    })

    it("stores custom content type", () => {
      const stream = HttpApiSchema.StreamUint8Array({
        contentType: "application/custom-binary"
      })

      assert.strictEqual(stream.contentType, "application/custom-binary")
    })
  })

  describe("WithHeaders", () => {
    it("stores the inner schema and headers schema", () => {
      const headers = Schema.Struct({ "x-total-count": Schema.FiniteFromString })
      const schema = HttpApiSchema.WithHeaders(Schema.String, headers)

      assert.isTrue(Schema.isSchema(schema))
      assert.isTrue(HttpApiSchema.isWithHeaders(schema))
      assert.strictEqual(schema.schema, Schema.String)
      assert.strictEqual(schema.headers, headers)
    })

    it("does not identify other schemas as WithHeaders", () => {
      assert.isFalse(HttpApiSchema.isWithHeaders(Schema.String))
      assert.isFalse(HttpApiSchema.isWithHeaders(HttpApiSchema.StreamUint8Array()))
    })

    it("supports a fields shorthand for headers", () => {
      const schema = HttpApiSchema.WithHeaders(Schema.String, {
        "x-total-count": Schema.FiniteFromString
      })

      assert.isTrue(Schema.isSchema(schema.headers))
      assert.deepStrictEqual(Object.keys(schema.headers.fields), ["x-total-count"])
    })

    it("rejects nested WithHeaders schemas", () => {
      const inner = HttpApiSchema.WithHeaders(Schema.String, { "x-a": Schema.String })

      assert.throws(
        () => HttpApiSchema.WithHeaders(inner, { "x-b": Schema.String }),
        "WithHeaders schemas cannot be nested"
      )
    })

    it("accepts only branded values when decoding", () => {
      const schema = HttpApiSchema.WithHeaders(Schema.String, { "x-a": Schema.String })
      const value = HttpApiSchema.withHeaders({ body: "a", headers: { "x-a": "1" } })

      assert.strictEqual(Schema.decodeUnknownSync(schema)(value), value)
      assert.throws(() => Schema.decodeUnknownSync(schema)({ body: "a", headers: { "x-a": "1" } }))
    })

    it("keeps the wrapper intact through annotate", () => {
      const headers = Schema.Struct({ "x-a": Schema.String })
      const schema = HttpApiSchema.WithHeaders(Schema.String, headers).annotate({ description: "described" })

      assert.isTrue(HttpApiSchema.isWithHeaders(schema))
      assert.strictEqual(schema.schema, Schema.String)
      assert.strictEqual(schema.headers, headers)
    })

    it("resolves the status from the wrapper first, falling through to the inner schema", () => {
      const headers = Schema.Struct({ "x-a": Schema.String })

      const onInner = HttpApiSchema.WithHeaders(Schema.String.pipe(HttpApiSchema.status(201)), headers)
      assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(onInner), 201)

      const onWrapper = HttpApiSchema.WithHeaders(Schema.String, headers).pipe(HttpApiSchema.status(202))
      assert.isTrue(HttpApiSchema.isWithHeaders(onWrapper))
      assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(onWrapper), 202)

      const onBoth = HttpApiSchema.WithHeaders(Schema.String.pipe(HttpApiSchema.status(201)), headers)
        .pipe(HttpApiSchema.status(202))
      assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(onBoth), 202)

      const onNeither = HttpApiSchema.WithHeaders(Schema.String, headers)
      assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(onNeither), 200)

      assert.strictEqual(HttpApiSchema.getStatusSuccessSchema(Schema.String.pipe(HttpApiSchema.status(201))), 201)
    })

    it("resolves the response encoding from the wrapper first, falling through to the inner schema", () => {
      const headers = Schema.Struct({ "x-a": Schema.String })

      const onInner = HttpApiSchema.WithHeaders(Schema.String.pipe(HttpApiSchema.asText()), headers)
      assert.strictEqual(HttpApiSchema.getResponseEncodingSchema(onInner)._tag, "Text")

      const onWrapper = HttpApiSchema.WithHeaders(Schema.String, headers).pipe(
        HttpApiSchema.asJson({ contentType: "application/vnd.custom+json" })
      )
      assert.isTrue(HttpApiSchema.isWithHeaders(onWrapper))
      assert.strictEqual(
        HttpApiSchema.getResponseEncodingSchema(onWrapper).contentType,
        "application/vnd.custom+json"
      )

      const onNeither = HttpApiSchema.WithHeaders(Schema.String, headers)
      assert.strictEqual(HttpApiSchema.getResponseEncodingSchema(onNeither)._tag, "Json")
    })
  })

  describe("withHeaders", () => {
    it("constructs a branded response value", () => {
      const value = HttpApiSchema.withHeaders({ body: "a", headers: { "x-a": "1" } })

      assert.strictEqual(value.body, "a")
      assert.deepStrictEqual(value.headers, { "x-a": "1" })
    })
  })

  describe("encodeToWithHeaders", () => {
    class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
      userId: Schema.Int
    }) {}

    const WrappedUserNotFound = UserNotFound.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: HttpApiSchema.Empty(404),
        headers: { "x-user-id": Schema.Int }
      }, {
        decode: ({ headers }) => new UserNotFound({ userId: headers["x-user-id"] }),
        encode: (error) => ({
          headers: { "x-user-id": error.userId },
          body: undefined
        })
      })
    )

    it("encodes to a body and headers pair", () => {
      assert.deepStrictEqual(
        Schema.encodeSync(WrappedUserNotFound)(new UserNotFound({ userId: 1 })),
        { body: undefined, headers: { "x-user-id": 1 } }
      )
    })

    it("decodes a pair back to the source type", () => {
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(WrappedUserNotFound)({ body: undefined, headers: { "x-user-id": 1 } }),
        new UserNotFound({ userId: 1 })
      )
    })

    it("resolves the status from the body schema", () => {
      assert.strictEqual(HttpApiSchema.getStatusError(WrappedUserNotFound.ast), 404)
    })

    it("resolves the response encoding from the body schema", () => {
      const schema = Schema.String.pipe(
        HttpApiSchema.encodeToWithHeaders({
          body: Schema.String.pipe(HttpApiSchema.asText()),
          headers: { "x-a": Schema.String }
        }, {
          decode: ({ body }) => body,
          encode: (value) => ({ body: value, headers: { "x-a": "1" } })
        })
      )

      assert.strictEqual(HttpApiSchema.getResponseEncoding(schema.ast)._tag, "Text")
    })

    it("defaults the response encoding to Json", () => {
      assert.strictEqual(HttpApiSchema.getResponseEncoding(WrappedUserNotFound.ast)._tag, "Json")
    })

    it("uses the body defaults instead of source response metadata", () => {
      const schema = Schema.String.pipe(
        HttpApiSchema.status(429),
        HttpApiSchema.asText(),
        HttpApiSchema.encodeToWithHeaders({
          body: Schema.String,
          headers: { "x-note": Schema.String }
        }, {
          decode: ({ body }) => body,
          encode: (body) => ({ body, headers: { "x-note": "test" } })
        })
      )

      assert.deepStrictEqual({
        status: HttpApiSchema.getStatusError(schema.ast),
        encoding: HttpApiSchema.getResponseEncoding(schema.ast)
      }, {
        status: 500,
        encoding: { _tag: "Json", contentType: "application/json" }
      })
    })
  })

  it("does not identify buffered schemas as stream schemas", () => {
    assert.isFalse(HttpApiSchema.isStreamSchema(Schema.String))
    assert.isFalse(HttpApiSchema.isStreamSchema(Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())))
  })

  describe("status", () => {
    it("accepts status literals", () => {
      assert.strictEqual(HttpApiSchema.getStatusSuccess(Schema.String.pipe(HttpApiSchema.status("Created")).ast), 201)
      assert.strictEqual(HttpApiSchema.getStatusError(Schema.String.pipe(HttpApiSchema.status("Conflict")).ast), 409)
    })
  })
})
