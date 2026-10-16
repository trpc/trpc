import { Schema } from "effect"
import type * as Sse from "effect/encoding/Sse"
import { HttpApiSchema } from "effect/http-api"
import { describe, expect, it } from "tstyche"

describe("HttpApiSchema", () => {
  describe("status", () => {
    it("preserves schema services when used with pipe", () => {
      class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

      const schema = NotFound.pipe(HttpApiSchema.status(404))

      expect<typeof schema["Type"]>().type.toBe<NotFound>()
      expect<typeof schema["EncodingServices"]>().type.toBe<never>()
      expect<typeof schema["DecodingServices"]>().type.toBe<never>()
    })
  })

  describe("StreamSse", () => {
    it("preserves event and error schemas", () => {
      const Events = Schema.Struct({
        event: Schema.Literal("user.created"),
        data: Schema.String
      })
      const Error = Schema.Struct({ reason: Schema.String })
      const stream = HttpApiSchema.StreamSse({ events: Events, error: Error })

      expect(stream).type.toBe<HttpApiSchema.StreamSse<typeof Events, typeof Error>>()
      expect(stream.events).type.toBe<typeof Events>()
      expect(stream.error).type.toBe<typeof Error>()
      expect(stream.mode).type.toBe<"sse">()
      expect(stream.sseMode).type.toBe<"events" | "data">()
    })

    it("preserves the stream schema type when annotated with status", () => {
      const Events = Schema.Struct({
        event: Schema.Literal("user.created"),
        data: Schema.String
      })
      const Error = Schema.Struct({ reason: Schema.String })
      const stream = HttpApiSchema.status(202)(HttpApiSchema.StreamSse({ events: Events, error: Error }))

      expect(stream).type.toBe<HttpApiSchema.StreamSse<typeof Events, typeof Error>>()
    })

    it("can be annotated like a regular schema", () => {
      const Events = Schema.Struct({
        event: Schema.Literal("user.created"),
        data: Schema.String
      })
      const stream = HttpApiSchema.StreamSse({ events: Events }).annotate({ title: "Events" })

      expect(stream).type.toBe<HttpApiSchema.StreamSse<typeof Events, Schema.Never>>()
    })

    it("defaults the stream error schema to Never", () => {
      const Events = Schema.Struct({
        event: Schema.Literal("user.created"),
        data: Schema.String
      })
      const stream = HttpApiSchema.StreamSse({ events: Events })

      expect(stream).type.toBe<HttpApiSchema.StreamSse<typeof Events, Schema.Never>>()
      expect(stream.error).type.toBe<Schema.Never>()
    })

    it("creates an event schema from a JSON data schema", () => {
      const Data = Schema.Struct({ id: Schema.String })
      const Error = Schema.Struct({ reason: Schema.String })
      const stream = HttpApiSchema.StreamSse({ data: Data, error: Error })

      expect(stream).type.toBe<
        HttpApiSchema.StreamSse<HttpApiSchema.SseEventFromData<typeof Data>, typeof Error, { readonly id: string }>
      >()
      expect(stream.events["Type"]).type.toBe<{
        readonly id?: string | undefined
        readonly event: string
        readonly data: { readonly id: string }
      }>()
      expect(stream.events["Encoded"]).type.toBe<Sse.EventCodec["Encoded"]>()
    })

    it("defaults the data stream error schema to Never", () => {
      const Data = Schema.Struct({ id: Schema.String })
      const stream = HttpApiSchema.StreamSse({ data: Data })

      expect(stream).type.toBe<
        HttpApiSchema.StreamSse<HttpApiSchema.SseEventFromData<typeof Data>, Schema.Never, { readonly id: string }>
      >()
      expect(stream.error).type.toBe<Schema.Never>()
    })

    it("requires valid event and error schemas", () => {
      expect(HttpApiSchema.StreamSse).type.not.toBeCallableWith({
        events: {},
        error: Schema.String
      })
      expect(HttpApiSchema.StreamSse).type.not.toBeCallableWith({
        events: Schema.String,
        error: {}
      })
    })

    it("requires event schemas to encode to SSE events", () => {
      expect(HttpApiSchema.StreamSse).type.not.toBeCallableWith({
        events: Schema.String,
        error: Schema.String
      })
      expect(HttpApiSchema.StreamSse).type.not.toBeCallableWith({
        events: Schema.Struct({ event: Schema.String }),
        error: Schema.String
      })
      expect(HttpApiSchema.StreamSse).type.not.toBeCallableWith({
        events: Schema.Struct({ event: Schema.String, data: Schema.Number }),
        error: Schema.String
      })
    })
  })

  describe("WithHeaders", () => {
    it("preserves the inner schema and headers schema types", () => {
      const Headers = Schema.Struct({ "x-total-count": Schema.FiniteFromString })
      const schema = HttpApiSchema.WithHeaders(Schema.String, Headers)

      expect(schema).type.toBe<HttpApiSchema.WithHeaders<Schema.String, typeof Headers>>()
      expect(schema.schema).type.toBe<Schema.String>()
      expect(schema.headers).type.toBe<typeof Headers>()
      expect<typeof schema["Type"]>().type.toBe<
        HttpApiSchema.withHeaders<string, { readonly "x-total-count": number }>
      >()
    })

    it("supports a fields shorthand for headers", () => {
      const schema = HttpApiSchema.WithHeaders(Schema.String, {
        "x-total-count": Schema.FiniteFromString
      })

      expect(schema).type.toBe<
        HttpApiSchema.WithHeaders<Schema.String, Schema.Struct<{ "x-total-count": Schema.FiniteFromString }>>
      >()
    })

    it("preserves the wrapper type when annotated with status", () => {
      const Headers = Schema.Struct({ "x-total-count": Schema.FiniteFromString })
      const schema = HttpApiSchema.WithHeaders(Schema.String, Headers).pipe(HttpApiSchema.status(201))

      expect(schema).type.toBe<HttpApiSchema.WithHeaders<Schema.String, typeof Headers>>()
    })

    it("preserves schema services", () => {
      const Headers = Schema.Struct({ "x-total-count": Schema.FiniteFromString })
      const schema = HttpApiSchema.WithHeaders(Schema.String, Headers)

      expect<typeof schema["DecodingServices"]>().type.toBe<never>()
      expect<typeof schema["EncodingServices"]>().type.toBe<never>()
    })
  })

  describe("withHeaders", () => {
    it("constructs a branded value", () => {
      const value = HttpApiSchema.withHeaders({ body: "a", headers: { "x-a": "1" } })

      expect(value).type.toBe<HttpApiSchema.withHeaders<string, { "x-a": string }>>()
      expect(value.body).type.toBe<string>()
    })
  })

  describe("encodeToWithHeaders", () => {
    it("keeps the source Type and encodes to a body and headers pair", () => {
      class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
        userId: Schema.Int
      }) {}

      const schema = UserNotFound.pipe(
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

      expect<typeof schema["Type"]>().type.toBe<UserNotFound>()
      expect<typeof schema["Encoded"]>().type.toBeAssignableTo<{
        readonly body: void
        readonly headers: { readonly "x-user-id": number }
      }>()
    })
  })

  describe("StreamUint8Array", () => {
    it("constructs the stream schema", () => {
      const stream = HttpApiSchema.StreamUint8Array()

      expect(stream).type.toBe<HttpApiSchema.StreamUint8Array>()
      expect(stream.mode).type.toBe<"uint8array">()
      expect(stream.contentType).type.toBe<string>()
    })

    it("preserves the stream schema type when annotated with status", () => {
      const stream = HttpApiSchema.status("PartialContent")(HttpApiSchema.StreamUint8Array())

      expect(stream).type.toBe<HttpApiSchema.StreamUint8Array>()
    })
  })
})
