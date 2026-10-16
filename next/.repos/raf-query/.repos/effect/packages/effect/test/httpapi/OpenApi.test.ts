import { assert, describe, it } from "@effect/vitest"
import { type Context, Effect, Predicate, Schema, SchemaTransformation } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi
} from "effect/http-api"

class HeaderAuthA extends HttpApiMiddleware.Service<HeaderAuthA>()("HeaderAuthA", {
  security: {
    auth: HttpApiSecurity.apiKey({ key: "x-api-key" })
  }
}) {}

class HeaderAuthB extends HttpApiMiddleware.Service<HeaderAuthB>()("HeaderAuthB", {
  security: {
    auth: HttpApiSecurity.apiKey({ key: "x-api-key" })
  }
}) {}

class HeaderAuthUpper extends HttpApiMiddleware.Service<HeaderAuthUpper>()("HeaderAuthUpper", {
  security: {
    auth: HttpApiSecurity.apiKey({ key: "X-API-Key" })
  }
}) {}

class QueryAuth extends HttpApiMiddleware.Service<QueryAuth>()("QueryAuth", {
  security: {
    auth: HttpApiSecurity.apiKey({ key: "api_key", in: "query" })
  }
}) {}

class TokenAuthUpper extends HttpApiMiddleware.Service<TokenAuthUpper>()("TokenAuthUpper", {
  security: {
    auth: HttpApiSecurity.http({ scheme: "Token" })
  }
}) {}

class TokenAuthLower extends HttpApiMiddleware.Service<TokenAuthLower>()("TokenAuthLower", {
  security: {
    auth: HttpApiSecurity.http({ scheme: "token" })
  }
}) {}

class ProtoHeaderAuth extends HttpApiMiddleware.Service<ProtoHeaderAuth>()("ProtoHeaderAuth", {
  security: {
    ["__proto__"]: HttpApiSecurity.apiKey({ key: "x-api-key" })
  }
}) {}

class ProtoQueryAuth extends HttpApiMiddleware.Service<ProtoQueryAuth>()("ProtoQueryAuth", {
  security: {
    ["__proto__"]: HttpApiSecurity.apiKey({ key: "api_key", in: "query" })
  }
}) {}

const makeSecurityApi = (
  first: Context.Key<any, any>,
  second: Context.Key<any, any>
) =>
  HttpApi.make("Api").add(
    HttpApiGroup.make("test").add(
      HttpApiEndpoint.get("first", "/first").middleware(first),
      HttpApiEndpoint.get("second", "/second").middleware(second)
    )
  )

describe("OpenApi", () => {
  it("preserves literal action suffixes in path templates", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("operations").add(
        HttpApiEndpoint.post("wait", "/operations/:id:wait", {
          params: { id: Schema.String }
        })
      )
    )
    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(Object.keys(spec.paths), ["/operations/{id}:wait"])
    assert.deepStrictEqual(spec.paths["/operations/{id}:wait"]?.post?.parameters, [
      { name: "id", in: "path", required: true, schema: { type: "string" } }
    ])
  })

  it("keeps action paths literal when no parameter schema is declared", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("offers").add(HttpApiEndpoint.post("resolve", "/offers:resolve"))
    )
    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(Object.keys(spec.paths), ["/offers:resolve"])
    assert.deepStrictEqual(spec.paths["/offers:resolve"]?.post?.parameters, [])
  })

  it("preserves parameter schemas when an endpoint transform reorders parameters", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("list", "/list", {
          query: { first: Schema.Literal("first"), second: Schema.Literal("second") }
        }).annotate(OpenApi.Transform, (operation: Record<string, any>) => ({
          ...operation,
          parameters: [...operation.parameters].reverse()
        }))
      )
    )

    assert.deepStrictEqual(OpenApi.fromApi(Api).paths["/list"]?.get?.parameters, [
      { name: "second", in: "query", required: true, schema: { type: "string", enum: ["second"] } },
      { name: "first", in: "query", required: true, schema: { type: "string", enum: ["first"] } }
    ])
  })

  it("derives parameter names, optionality, and schemas from the encoded object representation", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("list", "/list/:cursor", {
          params: {
            cursor: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("0")))
          },
          query: {
            limit: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("10"))),
            offset: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("0"))),
            search: Schema.String.annotateKey({ description: "Search text" })
          },
          headers: {
            "x-page-size": Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("10")))
          }
        })
      )
    )

    assert.deepStrictEqual(OpenApi.fromApi(Api).paths["/list/{cursor}"]?.get?.parameters, [
      { name: "cursor", in: "path", required: true, schema: { type: "string" } },
      { name: "x-page-size", in: "header", required: false, schema: { type: "string" } },
      { name: "limit", in: "query", required: false, schema: { type: "string" } },
      {
        name: "offset",
        in: "query",
        required: false,
        schema: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      {
        name: "search",
        in: "query",
        required: true,
        schema: { type: "string", allOf: [{ description: "Search text" }] }
      }
    ])
  })

  it("does not apply JSON codecs to parameters when codecs are disabled", () => {
    const OpaqueString = Schema.declare((input): input is string => typeof input === "string", {
      toCodecJson: () => Schema.link<string>()(Schema.String, SchemaTransformation.passthrough())
    })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test")
        .add(HttpApiEndpoint.get("encoded", "/encoded", { query: { value: OpaqueString } }))
        .add(HttpApiEndpoint.get("unencoded", "/unencoded", {
          disableCodecs: true,
          query: { value: OpaqueString }
        }))
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/encoded"]?.get?.parameters, [
      { name: "value", in: "query", required: true, schema: { type: "string" } }
    ])
    assert.deepStrictEqual(spec.paths["/unencoded"]?.get?.parameters, [
      { name: "value", in: "query", required: true, schema: {} }
    ])
  })

  it("returns fresh spec instances when using the cache", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("get", "/resource")
      )
    )

    const first = OpenApi.fromApi(Api)
    first.info.title = "mutated"
    first.paths["/resource"]!.get!.summary = "mutated"

    const second = OpenApi.fromApi(Api)

    assert.notStrictEqual(first, second)
    assert.notStrictEqual(first.info, second.info)
    assert.notStrictEqual(first.paths["/resource"]!.get, second.paths["/resource"]!.get)
    assert.strictEqual(second.info.title, "Api")
    assert.isUndefined(second.paths["/resource"]!.get!.summary)

    second.info.title = "mutated again"
    second.paths["/resource"]!.get!.summary = "mutated again"
    const third = OpenApi.fromApi(Api)

    assert.strictEqual(third.info.title, "Api")
    assert.isUndefined(third.paths["/resource"]!.get!.summary)
  })

  it("preserves JSON.rawJSON values when cloning cached specs", () => {
    const rawJson = (JSON as unknown as { rawJSON: (value: string) => unknown }).rawJSON("9223372036854775807")
    const Api = HttpApi.make("Api").annotate(OpenApi.Transform, (spec) => ({
      ...spec,
      info: {
        ...spec.info,
        "x-raw": rawJson
      }
    }))

    const expected = `{"title":"Api","version":"0.0.1","x-raw":9223372036854775807}`

    assert.strictEqual(JSON.stringify(OpenApi.fromApi(Api).info), expected)
    assert.strictEqual(JSON.stringify(OpenApi.fromApi(Api).info), expected)
  })

  it("isolates the cached spec from external override mutations", () => {
    const info = { title: "Api", version: "1.0.0" }
    const Api = HttpApi.make("Api").annotate(OpenApi.Override, { info })

    OpenApi.fromApi(Api)
    info.title = "mutated"

    const cached = OpenApi.fromApi(Api)

    assert.strictEqual(cached.info.title, "Api")
  })

  it("preserves every declared payload content type for normalized equivalents", () => {
    const profileA = "Application/Vnd.Effect+JSON; Profile=A"
    const profileB = "application/vnd.effect+json; profile=b"
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", {
          payload: [
            Schema.Struct({ a: Schema.String }).pipe(HttpApiSchema.asJson({ contentType: profileA })),
            Schema.Struct({ b: Schema.String }).pipe(HttpApiSchema.asJson({ contentType: profileB }))
          ]
        })
      )
    )

    const spec = OpenApi.fromApi(Api)
    const content = spec.paths["/create"]?.post?.requestBody?.content

    assert.isDefined(content)
    assert.property(content, profileA)
    assert.property(content, profileB)
    assert.deepStrictEqual(content[profileA]?.schema, {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false
    })
    assert.deepStrictEqual(content[profileB]?.schema, {
      type: "object",
      properties: { b: { type: "string" } },
      required: ["b"],
      additionalProperties: false
    })
  })

  it("preserves GET and QUERY schemas on the same path", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("search").add(
        HttpApiEndpoint.get("list", "/search", { success: Schema.Finite }),
        HttpApiEndpoint.query("search", "/search", {
          payload: Schema.String,
          success: Schema.Boolean
        }).annotate(OpenApi.Transform, (operation: Record<string, any>) => {
          assert.deepStrictEqual(operation.requestBody.content["application/json"].schema, { type: "string" })
          return { ...operation, summary: "Search" }
        })
      )
    )

    const spec = OpenApi.fromApi(Api)
    const pathItem = spec.paths["/search"]
    const query = pathItem["x-oai-additionalOperations"]?.QUERY

    assert.strictEqual(spec.openapi, "3.1.0")
    assert.deepStrictEqual(Object.keys(pathItem), ["get", "x-oai-additionalOperations"])
    assert.strictEqual(query?.summary, "Search")
    assert.deepStrictEqual(pathItem.get?.responses[200]?.content?.["application/json"]?.schema, { type: "number" })
    assert.deepStrictEqual(query?.responses[200]?.content?.["application/json"]?.schema, { type: "boolean" })
  })

  it("emits buffered and stream successes with the same status", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("chat", "/chat", {
          success: [
            Schema.Struct({ message: Schema.String }),
            HttpApiSchema.StreamSse({
              events: Schema.Struct({ event: Schema.String, data: Schema.String }),
              error: Schema.Struct({ reason: Schema.String })
            })
          ]
        })
      )
    )

    const spec = OpenApi.fromApi(Api)
    const content = spec.paths["/chat"]?.get?.responses[200]?.content

    assert.isNotNull(content)
    assert.property(content, "application/json")
    assert.property(content, "text/event-stream")
    const streamExtension = content?.["text/event-stream"]?.["x-effect-stream"]
    assert.isNotNull(streamExtension)
    if (streamExtension?.encoding !== "sse") {
      throw new Error("Expected SSE stream extension")
    }
    assert.strictEqual(
      streamExtension.failureEvent,
      "effect/http-api/stream/failure"
    )
    assert.property(streamExtension, "causeSchema")
    assert.property(streamExtension, "errorSchema")
  })

  it("emits the encoded schema of text bodies", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", {
          payload: Schema.String.check(Schema.isPattern(/^[a-z]+$/u)).pipe(HttpApiSchema.asText()),
          success: Schema.Literal("Created").pipe(HttpApiSchema.asText()),
          error: [
            Schema.Literal("Bad Request").pipe(HttpApiSchema.asText(), HttpApiSchema.status(400)),
            Schema.Literal("Invalid Cursor").pipe(HttpApiSchema.asText(), HttpApiSchema.status(400)),
            Schema.Literal("Not Found").pipe(
              Schema.decodeTo(
                NotFound,
                SchemaTransformation.transform({
                  decode: () => ({ _tag: "NotFound" as const }),
                  encode: () => "Not Found" as const
                })
              ),
              HttpApiSchema.asText(),
              HttpApiSchema.status(404)
            )
          ]
        })
      )
    )

    const spec = OpenApi.fromApi(Api)
    const operation = spec.paths["/create"]?.post

    assert.deepStrictEqual(operation?.requestBody?.content["text/plain"]?.schema, {
      type: "string",
      pattern: "^[a-z]+$"
    })
    assert.deepStrictEqual(operation?.responses[200]?.content?.["text/plain"]?.schema, {
      type: "string",
      enum: ["Created"]
    })
    assert.deepStrictEqual(operation?.responses[400]?.content?.["text/plain"]?.schema, {
      type: "string",
      enum: ["Bad Request", "Invalid Cursor"]
    })
    assert.deepStrictEqual(operation?.responses[404]?.content?.["text/plain"]?.schema, {
      type: "string",
      $ref: "#/components/schemas/NotFoundEncoded"
    })
    assert.deepStrictEqual(spec.components.schemas.NotFoundEncoded, { type: "string", enum: ["Not Found"] })
  })

  it("keeps opaque text bodies as strings", () => {
    const Text = Schema.declare<string>(Predicate.isString).pipe(HttpApiSchema.asText())
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", {
          payload: Text,
          success: Text,
          error: Text.pipe(HttpApiSchema.status(400))
        })
      )
    )

    const operation = OpenApi.fromApi(Api).paths["/create"]?.post

    assert.deepStrictEqual(operation?.requestBody?.content["text/plain"]?.schema, { type: "string" })
    assert.deepStrictEqual(operation?.responses[200]?.content?.["text/plain"]?.schema, { type: "string" })
    assert.deepStrictEqual(operation?.responses[400]?.content?.["text/plain"]?.schema, { type: "string" })
  })

  it("constrains referenced opaque text bodies without changing shared JSON schemas", () => {
    const OpaqueText = Schema.declare<string>(Predicate.isString).annotate({ identifier: "OpaqueText" })
    const Text = OpaqueText.pipe(HttpApiSchema.asText())
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("text", "/text", {
          payload: Text,
          success: Text,
          error: Text.pipe(HttpApiSchema.status(400))
        }),
        HttpApiEndpoint.post("json", "/json", {
          payload: OpaqueText,
          success: OpaqueText
        })
      )
    )

    const spec = OpenApi.fromApi(Api)
    const textOperation = spec.paths["/text"]?.post
    const jsonOperation = spec.paths["/json"]?.post
    const jsonReference = { $ref: "#/components/schemas/OpaqueTextEncoded" }
    const textSchema = { type: "string" }

    assert.deepStrictEqual(textOperation?.requestBody?.content["text/plain"]?.schema, textSchema)
    assert.deepStrictEqual(textOperation?.responses[200]?.content?.["text/plain"]?.schema, textSchema)
    assert.deepStrictEqual(textOperation?.responses[400]?.content?.["text/plain"]?.schema, textSchema)
    assert.deepStrictEqual(jsonOperation?.requestBody?.content["application/json"]?.schema, jsonReference)
    assert.deepStrictEqual(jsonOperation?.responses[200]?.content?.["application/json"]?.schema, jsonReference)
    assert.deepStrictEqual(spec.components.schemas, { OpaqueTextEncoded: {} })
  })

  it("uses encoding-specific codecs for text, JSON, and form bodies", () => {
    const OpaqueString = Schema.declare<string>(Predicate.isString, {
      toCodecJson: () =>
        Schema.link<string>()(
          Schema.Struct({ value: Schema.String }),
          SchemaTransformation.transform({
            decode: ({ value }) => value,
            encode: (value) => ({ value })
          })
        )
    })
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.post("create", "/create", {
          payload: [
            OpaqueString,
            OpaqueString.pipe(HttpApiSchema.asText()),
            OpaqueString.pipe(HttpApiSchema.asFormUrlEncoded())
          ],
          success: [
            OpaqueString,
            OpaqueString.pipe(HttpApiSchema.asText()),
            OpaqueString.pipe(HttpApiSchema.asFormUrlEncoded())
          ]
        })
      )
    )

    const operation = OpenApi.fromApi(Api).paths["/create"]?.post
    const objectSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false
    }

    assert.deepStrictEqual(operation?.requestBody?.content["text/plain"]?.schema, { type: "string" })
    assert.deepStrictEqual(operation?.responses[200]?.content?.["text/plain"]?.schema, { type: "string" })
    assert.deepStrictEqual(operation?.requestBody?.content["application/json"]?.schema, objectSchema)
    assert.deepStrictEqual(operation?.responses[200]?.content?.["application/json"]?.schema, objectSchema)
    assert.deepStrictEqual(
      operation?.requestBody?.content["application/x-www-form-urlencoded"]?.schema,
      objectSchema
    )
    assert.deepStrictEqual(
      operation?.responses[200]?.content?.["application/x-www-form-urlencoded"]?.schema,
      objectSchema
    )
  })

  it("emits encoded success response headers", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("success", "/success", {
          success: HttpApiSchema.WithHeaders(Schema.String, {
            "X-Count": Schema.FiniteFromString,
            "X-Optional": Schema.optionalKey(Schema.FiniteFromString),
            "Content-Type": Schema.String
          })
        })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/success"]?.get?.responses[200]?.headers, {
      "x-count": {
        schema: { type: "string" },
        required: true
      },
      "x-optional": {
        schema: { type: "string" },
        required: false
      }
    })
  })

  it("marks response headers optional from their encoded object representation", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("success", "/success", {
          success: HttpApiSchema.WithHeaders(Schema.String, {
            "X-Total": Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("0"))),
            "X-Offset": Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("0")))
          })
        })
      )
    )

    assert.deepStrictEqual(OpenApi.fromApi(Api).paths["/success"]?.get?.responses[200]?.headers, {
      "x-total": {
        schema: { type: "string" },
        required: false
      },
      "x-offset": {
        schema: { anyOf: [{ type: "string" }, { type: "null" }] },
        required: false
      }
    })
  })

  it("emits encoded error response headers", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.Number
    }) {}
    const NotFoundWithHeaders = NotFound.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: HttpApiSchema.Empty(404),
        headers: { "X-Error-Id": Schema.FiniteFromString }
      }, {
        decode: ({ headers }) => new NotFound({ id: headers["X-Error-Id"] }),
        encode: (error) => ({ body: undefined, headers: { "X-Error-Id": error.id } })
      })
    )
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", {
          error: NotFoundWithHeaders
        })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[404]?.headers, {
      "x-error-id": {
        schema: { type: "string" },
        required: true
      }
    })
  })

  it("emits encodeToWithHeaders wire schemas according to codec mode", () => {
    const ErrorWithHeaders = Schema.Number.pipe(
      HttpApiSchema.encodeToWithHeaders({
        body: HttpApiSchema.Empty(404),
        headers: { "X-Error-Id": Schema.Int }
      }, {
        decode: ({ headers }) => headers["X-Error-Id"],
        encode: (id) => ({ body: undefined, headers: { "X-Error-Id": id } })
      })
    )
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test")
        .add(
          HttpApiEndpoint.get("encoded", "/encoded", {
            error: ErrorWithHeaders
          })
        )
        .add(
          HttpApiEndpoint.get("unencoded", "/unencoded", {
            disableCodecs: true,
            error: ErrorWithHeaders
          })
        )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(
      spec.paths["/encoded"]?.get?.responses[404]?.headers?.["x-error-id"]?.schema,
      {
        type: "string",
        pattern: "^[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?$"
      }
    )
    assert.deepStrictEqual(
      spec.paths["/unencoded"]?.get?.responses[404]?.headers?.["x-error-id"]?.schema,
      { type: "integer" }
    )
  })

  it("emits headers for an error wrapped in WithHeaders", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", {
          error: HttpApiSchema.WithHeaders(
            Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(429)),
            { "X-Retry-After": Schema.Int }
          )
        })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[429]?.headers, {
      "x-retry-after": {
        schema: {
          type: "string",
          pattern: "^[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?$"
        },
        required: true
      }
    })
  })

  it("collapses a middleware error that repeats an endpoint error", () => {
    const ApiError = Schema.Struct({ code: Schema.String }).annotate({ identifier: "ApiError" })

    class SameError extends HttpApiMiddleware.Service<SameError>()("SameError", {
      error: ApiError
    }) {}

    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", { error: ApiError })
      )
    ).middleware(SameError)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" }
      }
    })
  })

  it("collapses a repeated middleware error when the endpoint disables codecs", () => {
    const ApiError = Schema.Struct({ code: Schema.String }).annotate({ identifier: "ApiError" })

    class SameError extends HttpApiMiddleware.Service<SameError>()("SameErrorNoCodecs", {
      error: ApiError
    }) {}

    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", {
          disableCodecs: true,
          error: ApiError
        })
      )
    ).middleware(SameError)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" }
      }
    })
  })

  it("resolves one shared middleware error per endpoint codec mode", () => {
    const ApiError = Schema.Struct({ code: Schema.String }).annotate({ identifier: "ApiError" })

    class SharedError extends HttpApiMiddleware.Service<SharedError>()("SharedError", {
      error: ApiError
    }) {}

    // The same middleware instance is attached to both endpoints, so its single
    // error set has to be resolved against each endpoint's `disableCodecs`.
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test")
        .add(HttpApiEndpoint.get("codecs", "/codecs", { error: ApiError }))
        .add(HttpApiEndpoint.get("raw", "/raw", { disableCodecs: true, error: ApiError }))
    ).middleware(SharedError)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/codecs"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" }
      }
    })
    assert.deepStrictEqual(spec.paths["/raw"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" }
      }
    })
  })

  it("emits an anyOf for a middleware error that differs from the endpoint error", () => {
    const EndpointError = Schema.Struct({ code: Schema.String }).annotate({ identifier: "EndpointError" })
    const MiddlewareError = Schema.Struct({ reason: Schema.String }).annotate({ identifier: "MiddlewareError" })

    class OtherError extends HttpApiMiddleware.Service<OtherError>()("OtherError", {
      error: MiddlewareError
    }) {}

    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", { error: EndpointError })
      )
    ).middleware(OtherError)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: {
          anyOf: [
            { $ref: "#/components/schemas/EndpointError" },
            { $ref: "#/components/schemas/MiddlewareError" }
          ]
        }
      }
    })
  })

  it("emits an anyOf for two different endpoint errors sharing a status", () => {
    const FirstError = Schema.Struct({ code: Schema.String }).annotate({ identifier: "FirstError" })
    const SecondError = Schema.Struct({ reason: Schema.String }).annotate({ identifier: "SecondError" })

    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", { error: [FirstError, SecondError] })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: {
          anyOf: [
            { $ref: "#/components/schemas/FirstError" },
            { $ref: "#/components/schemas/SecondError" }
          ]
        }
      }
    })
  })

  it("documents a middleware error for a status the endpoint does not declare", () => {
    const Unauthorized = Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(401)).annotate({
      identifier: "Unauthorized"
    })

    class Auth extends HttpApiMiddleware.Service<Auth>()("Auth", {
      error: Unauthorized
    }) {}

    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("error", "/error", {
          error: Schema.Struct({ code: Schema.String }).annotate({ identifier: "ServerError" })
        })
      )
    ).middleware(Auth)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[401]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/Unauthorized" }
      }
    })
    assert.deepStrictEqual(spec.paths["/error"]?.get?.responses[500]?.content, {
      "application/json": {
        schema: { $ref: "#/components/schemas/ServerError" }
      }
    })
  })

  it("emits stream response headers", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("stream", "/stream", {
          success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamUint8Array(), {
            "X-Stream-Id": Schema.Int
          })
        })
      )
    )

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.paths["/stream"]?.get?.responses[200]?.headers, {
      "x-stream-id": {
        schema: {
          type: "string",
          pattern: "^[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?$"
        },
        required: true
      }
    })
  })

  it("rejects duplicate method and path pairs", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("first", "/shared"),
        HttpApiEndpoint.get("second", "/shared")
      )
    )

    assert.throws(() => OpenApi.fromApi(Api), /Duplicate OpenAPI operation for GET \/shared/)
  })

  it("rejects equivalent templated method and path pairs", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("first", "/users/:id", { params: { id: Schema.String } }),
        HttpApiEndpoint.get("second", "/users/:userId", { params: { userId: Schema.String } })
      )
    )

    assert.throws(() => OpenApi.fromApi(Api), /Duplicate OpenAPI operation for GET \/users\/\{userId\}/)
  })

  it("rejects duplicate operation identifiers", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("first", "/first").annotate(OpenApi.Identifier, "shared"),
        HttpApiEndpoint.get("second", "/second").annotate(OpenApi.Identifier, "shared")
      )
    )

    assert.throws(() => OpenApi.fromApi(Api), /Duplicate OpenAPI operationId: shared/)
  })

  it("allows operations without identifiers", () => {
    const removeOperationId = (operation: Record<string, any>) => {
      const transformed = { ...operation }
      delete transformed.operationId
      return transformed
    }
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("first", "/first").annotate(OpenApi.Transform, removeOperationId),
        HttpApiEndpoint.get("second", "/second").annotate(OpenApi.Transform, removeOperationId)
      )
    )

    const spec = OpenApi.fromApi(Api)
    const first = spec.paths["/first"]?.get
    const second = spec.paths["/second"]?.get

    assert.isDefined(first)
    assert.isDefined(second)
    assert.isFalse(Object.hasOwn(first, "operationId"))
    assert.isFalse(Object.hasOwn(second, "operationId"))
  })

  it("rejects incompatible security schemes with the same name", () => {
    const Api = makeSecurityApi(HeaderAuthA, QueryAuth)

    assert.throws(() => OpenApi.fromApi(Api), /Conflicting OpenAPI security scheme: auth/)
  })

  it("deduplicates equivalent security schemes with the same name", () => {
    const Api = makeSecurityApi(HeaderAuthA, HeaderAuthB)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.components.securitySchemes.auth, {
      type: "apiKey",
      name: "x-api-key",
      in: "header"
    })
  })

  it("deduplicates API key header names case-insensitively", () => {
    const Api = makeSecurityApi(HeaderAuthUpper, HeaderAuthA)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.components.securitySchemes.auth, {
      type: "apiKey",
      name: "X-API-Key",
      in: "header"
    })
  })

  it("deduplicates HTTP security schemes case-insensitively", () => {
    const Api = makeSecurityApi(TokenAuthUpper, TokenAuthLower)

    const spec = OpenApi.fromApi(Api)

    assert.deepStrictEqual(spec.components.securitySchemes.auth, {
      type: "http",
      scheme: "Token"
    })
  })

  it("stores __proto__ security scheme names as own properties", () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("first", "/first").middleware(ProtoHeaderAuth)
      )
    )

    const spec = OpenApi.fromApi(Api)
    const schemes = spec.components.securitySchemes

    assert.isTrue(Object.hasOwn(schemes, "__proto__"))
    assert.deepStrictEqual(Object.keys(schemes), ["__proto__"])
    assert.strictEqual(Object.getPrototypeOf(schemes), Object.prototype)
    assert.deepStrictEqual(schemes["__proto__"], {
      type: "apiKey",
      name: "x-api-key",
      in: "header"
    })
  })

  it("rejects incompatible __proto__ security schemes", () => {
    const Api = makeSecurityApi(ProtoHeaderAuth, ProtoQueryAuth)

    assert.throws(() => OpenApi.fromApi(Api), /Conflicting OpenAPI security scheme: __proto__/)
  })
})
