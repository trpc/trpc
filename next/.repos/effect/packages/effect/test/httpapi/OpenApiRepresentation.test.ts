import { assert, describe, it } from "@effect/vitest"
import { Schema, type SchemaRepresentation } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"

describe("OpenApi representation v2 consumer", () => {
  it("uses canonical JSON codecs for additional declaration schemas", () => {
    const AdditionalDate = Schema.Date.annotate({ identifier: "AdditionalDate" })
    const Api = HttpApi.make("Api").annotate(HttpApi.AdditionalSchemas, [AdditionalDate])

    assert.deepStrictEqual(OpenApi.fromApi(Api).components.schemas, {
      AdditionalDate: { $ref: "#/components/schemas/AdditionalDateEncoded" },
      AdditionalDateEncoded: { type: "string" }
    })
  })

  it("applies the reference policy without removing additional schema components", () => {
    const AdditionalDate = Schema.Date.annotate({ identifier: "AdditionalDate" })
    const Api = HttpApi.make("Api").annotate(HttpApi.AdditionalSchemas, [AdditionalDate]).add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("date", "/date", { success: AdditionalDate })
      )
    )
    const spec = OpenApi.fromApi(Api, { referencePolicy: () => undefined })

    assert.deepStrictEqual(spec.components.schemas, {
      AdditionalDate: { type: "string" }
    })
    assert.deepStrictEqual(
      spec.paths["/date"]?.get?.responses[200]?.content?.["application/json"]?.schema,
      { type: "string" }
    )
  })

  it("includes selected custom annotation keys", () => {
    const Value = Schema.String.annotate({ identifier: "Value", "x-test-brand": "Value" })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("value", "/value", { success: Value })
      )
    )

    assert.deepStrictEqual(
      OpenApi.fromApi(Api, { includeAnnotationKey: (key) => key === "x-test-brand" }).components.schemas,
      { Value: { type: "string", "x-test-brand": "Value" } }
    )
    assert.deepStrictEqual(OpenApi.fromApi(Api).components.schemas, {
      Value: { type: "string" }
    })
  })

  it("uses canonical JSON codecs for response declaration schemas", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("date", "/date", { success: Schema.Date })
      )
    )

    assert.deepStrictEqual(
      OpenApi.fromApi(Api).paths["/date"]?.get?.responses[200]?.content?.["application/json"]?.schema,
      { type: "string" }
    )
  })

  it("includes definitions reachable only through SSE content", () => {
    const Nested = Schema.Struct({ text: Schema.String }).annotate({ identifier: "Nested" })
    const Content = Schema.Struct({ nested: Nested }).annotate({ identifier: "Content" })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("stream", "/stream", {
          success: HttpApiSchema.StreamSse({ data: Content })
        })
      )
    )
    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.components.schemas, {
      Nested: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false
      },
      Content: {
        type: "object",
        properties: { nested: { $ref: "#/components/schemas/Nested" } },
        required: ["nested"],
        additionalProperties: false
      },
      ContentEncoded: {
        type: "string",
        contentMediaType: "application/json",
        contentSchema: { $ref: "#/components/schemas/Content" }
      }
    })
  })

  it("shares content definitions across regular JSON and SSE responses", () => {
    const Content = Schema.Struct({ text: Schema.String }).annotate({ identifier: "Tool.Content" })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("content", "/content", {
          success: Content
        }),
        HttpApiEndpoint.get("stream", "/stream", {
          success: HttpApiSchema.StreamSse({ data: Content })
        })
      )
    )
    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.components.schemas, {
      "Tool.Content": {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false
      },
      "Tool.ContentEncoded": {
        type: "string",
        contentMediaType: "application/json",
        contentSchema: { $ref: "#/components/schemas/Tool.Content" }
      }
    })
    assert.deepStrictEqual(
      spec.paths["/content"]?.get?.responses[200]?.content?.["application/json"]?.schema,
      { $ref: "#/components/schemas/Tool.Content" }
    )
    assert.deepStrictEqual(
      spec.paths["/stream"]?.get?.responses[200]?.content?.["text/event-stream"]?.schema,
      {
        type: "object",
        properties: {
          id: { anyOf: [{ type: "string" }, { type: "null" }] },
          event: { type: "string" },
          data: { $ref: "#/components/schemas/Tool.ContentEncoded" }
        },
        required: ["event", "data"],
        additionalProperties: false
      }
    )
  })

  it("projects request and response schemas to the encoded side", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", {
          payload: Schema.FiniteFromString,
          success: Schema.FiniteFromString
        })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(
      spec.paths["/create"]?.post?.requestBody?.content["application/json"]?.schema,
      { type: "string" }
    )
    assert.deepStrictEqual(
      spec.paths["/create"]?.post?.responses[200]?.content?.["application/json"]?.schema,
      { type: "string" }
    )
  })

  it("uses custom JSON Schema compiler annotations", () => {
    const CustomString = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      representation: {
        id: "test/openapi/minTwoCharacters",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", { payload: CustomString })
      )
    )

    assert.deepStrictEqual(
      OpenApi.fromApi(Api).paths["/create"]?.post?.requestBody?.content["application/json"]?.schema,
      {
        type: "string",
        minLength: 2
      }
    )
  })

  it("shares definitions and returns cached copies by API identity", () => {
    const Shared = Schema.Struct({ value: Schema.FiniteFromString }).annotate({ identifier: "Shared" })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("shared", "/shared", {
          payload: Schema.Struct({ first: Shared, second: Shared }),
          success: Shared
        })
      )
    )

    const first = OpenApi.fromApi(Api)
    const second = OpenApi.fromApi(Api)

    assert.notStrictEqual(second, first)
    assert.deepStrictEqual(second, first)
    assert.deepStrictEqual(first.components.schemas.Shared, {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false
    })
  })

  describe("shares a named schema across response statuses", () => {
    const base = Schema.Struct({
      id: Schema.String,
      metadata: Schema.Record(Schema.String, Schema.Unknown)
    })

    it.each([
      { name: "plain", schema: base },
      { name: "checked", schema: base.check(Schema.isMinProperties(1)) },
      { name: "with key context", schema: base.pipe(HttpApiSchema.status(200)) }
    ])("$name", ({ schema }) => {
      const Widget = schema.annotate({ identifier: "Widget" })
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(
          HttpApiEndpoint.get("get", "/widget", { success: Widget }),
          HttpApiEndpoint.post("create", "/widget", { success: Widget.pipe(HttpApiSchema.status(201)) })
        )
      )

      const spec = OpenApi.fromApi(Api)

      assert.deepStrictEqual(Object.keys(spec.components.schemas), ["Widget"])
      assert.deepStrictEqual(
        spec.paths["/widget"]?.get?.responses[200]?.content?.["application/json"]?.schema,
        { $ref: "#/components/schemas/Widget" }
      )
      assert.deepStrictEqual(
        spec.paths["/widget"]?.post?.responses[201]?.content?.["application/json"]?.schema,
        { $ref: "#/components/schemas/Widget" }
      )
    })
  })

  it("retains referenced parameter schemas without emitting the parameter container", () => {
    const Filter = Schema.Struct({ value: Schema.String }).annotate({ identifier: "Filter" })
    const Query = Schema.Struct({ filter: Filter }).annotate({ identifier: "Query" })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("list", "/list", { query: Query })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/list"]?.get?.parameters, [
      { name: "filter", in: "query", required: true, schema: { $ref: "#/components/schemas/Filter" } }
    ])
    assert.deepStrictEqual(spec.components.schemas, {
      Filter: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false
      }
    })
  })

  it("caches generated specs by API and options identity", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("value", "/value", {
          success: Schema.Struct({ value: Schema.String })
        })
      )
    )
    let calls = 0
    const referencePolicy: SchemaRepresentation.ReferencePolicy = (input) => {
      calls++
      return input.identifier
    }
    const options = { referencePolicy }

    OpenApi.fromApi(Api, options)
    const callsAfterFirstGeneration = calls
    assert.isAbove(callsAfterFirstGeneration, 0)

    OpenApi.fromApi(Api, options)
    assert.strictEqual(calls, callsAfterFirstGeneration)

    OpenApi.fromApi(Api, { referencePolicy })
    assert.isAbove(calls, callsAfterFirstGeneration)
  })
})
