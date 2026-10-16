import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { OpenAPISpec, OpenAPISpecOperation, OpenAPISpecPathItem } from "effect/http-api/OpenApi"
import type * as JsonSchema from "effect/JsonSchema"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// These integration checks start a fresh TypeScript compiler under CI load.
const compilationTimeout = 60_000

function assertRuntime(spec: OpenAPISpec, expected: string) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient"
    })

    // console.log(result)
    assert.strictEqual(result, expected)
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerSchema)
  )
}

function assertTypeOnly(spec: OpenAPISpec, expected: string) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient-type-only"
    })

    // console.log(result)
    assert.strictEqual(result, expected)
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerTs)
  )
}

function assertRuntimeIncludes(
  spec: OpenAPISpec,
  includes: ReadonlyArray<string>,
  excludes: ReadonlyArray<string> = []
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient"
    })

    for (const expected of includes) {
      assert.include(result, expected)
    }
    for (const excluded of excludes) {
      assert.notInclude(result, excluded)
    }
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerSchema)
  )
}

function assertTypeOnlyIncludes(
  spec: OpenAPISpec,
  includes: ReadonlyArray<string>,
  excludes: ReadonlyArray<string> = []
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient-type-only"
    })

    for (const expected of includes) {
      assert.include(result, expected)
    }
    for (const excluded of excludes) {
      assert.notInclude(result, excluded)
    }
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerTs)
  )
}

function assertGeneratedClientsCompile(
  spec: OpenAPISpec,
  options: {
    readonly exactOptionalPropertyTypes?: boolean | undefined
    readonly formats?: ReadonlyArray<"httpclient" | "httpclient-type-only"> | undefined
    readonly usage?: string | undefined
  } = {}
) {
  const generate = (
    format: "httpclient" | "httpclient-type-only",
    layer: typeof OpenApiGenerator.layerTransformerSchema
  ) =>
    Effect.gen(function*() {
      const generator = yield* OpenApiGenerator.OpenApiGenerator
      return yield* generator.generate(spec, { name: "TestClient", format })
    }).pipe(Effect.provide(layer))

  return Effect.gen(function*() {
    const formats = options.formats ?? ["httpclient", "httpclient-type-only"]
    const clients = yield* Effect.all(formats.map((format) =>
      generate(
        format,
        format === "httpclient"
          ? OpenApiGenerator.layerTransformerSchema
          : OpenApiGenerator.layerTransformerTs
      )
    ))
    const directory = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), ".generated-clients-"))
    try {
      const files = clients.map((client, index) => {
        const path = join(directory, `Client${index}.ts`)
        writeFileSync(path, `${client}\n${options.usage ?? ""}`)
        return path
      })
      const configPath = join(directory, "tsconfig.json")
      writeFileSync(
        configPath,
        JSON.stringify({
          compilerOptions: {
            allowImportingTsExtensions: true,
            exactOptionalPropertyTypes: options.exactOptionalPropertyTypes ?? true,
            lib: ["ESNext", "DOM"],
            module: "NodeNext",
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: "ES2022",
            types: [],
            verbatimModuleSyntax: true
          },
          files
        })
      )
      const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
      const result = spawnSync(join(repositoryRoot, "node_modules/.bin/tsc"), ["-p", configPath, "--pretty", "false"], {
        cwd: repositoryRoot,
        encoding: "utf8"
      })
      assert.strictEqual(result.status, 0, `${result.stdout}${result.stderr}`)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

function assertHttpApiIncludes(
  spec: OpenAPISpec,
  includes: ReadonlyArray<string>,
  excludes: ReadonlyArray<string> = []
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpapi"
    })

    for (const expected of includes) {
      assert.include(result, expected)
    }
    for (const excluded of excludes) {
      assert.notInclude(result, excluded)
    }
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerSchema)
  )
}

function assertHttpApiWithWarnings(
  spec: OpenAPISpec,
  options: {
    readonly includes?: ReadonlyArray<string> | undefined
    readonly excludes?: ReadonlyArray<string> | undefined
    readonly occurrences?:
      | ReadonlyArray<{
        readonly substring: string
        readonly count: number
      }>
      | undefined
    readonly warnings: ReadonlyArray<
      Pick<OpenApiGenerator.OpenApiGeneratorWarning, "code" | "path" | "method" | "operationId">
    >
  }
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator
    const warnings: Array<OpenApiGenerator.OpenApiGeneratorWarning> = []

    const result = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpapi",
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })

    for (const expected of options.includes ?? []) {
      assert.include(result, expected)
    }
    for (const excluded of options.excludes ?? []) {
      assert.notInclude(result, excluded)
    }
    for (const { substring, count } of options.occurrences ?? []) {
      assert.strictEqual(result.split(substring).length - 1, count)
    }

    assert.deepStrictEqual(
      warnings.map((warning) => ({
        code: warning.code,
        path: warning.path,
        method: warning.method,
        operationId: warning.operationId
      })),
      options.warnings
    )
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerSchema)
  )
}

function assertRuntimeStableWithWarnings(
  spec: OpenAPISpec,
  expectedWarnings: ReadonlyArray<
    Pick<OpenApiGenerator.OpenApiGeneratorWarning, "code" | "path" | "method" | "operationId">
  >
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator
    const warnings: Array<OpenApiGenerator.OpenApiGeneratorWarning> = []

    const baseline = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient"
    })
    const withWarnings = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient",
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })

    assert.strictEqual(withWarnings, baseline)
    assert.deepStrictEqual(
      warnings.map((warning) => ({
        code: warning.code,
        path: warning.path,
        method: warning.method,
        operationId: warning.operationId
      })),
      expectedWarnings
    )
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerSchema)
  )
}

function assertTypeOnlyStableWithWarnings(
  spec: OpenAPISpec,
  expectedWarnings: ReadonlyArray<
    Pick<OpenApiGenerator.OpenApiGeneratorWarning, "code" | "path" | "method" | "operationId">
  >
) {
  return Effect.gen(function*() {
    const generator = yield* OpenApiGenerator.OpenApiGenerator
    const warnings: Array<OpenApiGenerator.OpenApiGeneratorWarning> = []

    const baseline = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient-type-only"
    })
    const withWarnings = yield* generator.generate(spec, {
      name: "TestClient",
      format: "httpclient-type-only",
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })

    assert.strictEqual(withWarnings, baseline)
    assert.deepStrictEqual(
      warnings.map((warning) => ({
        code: warning.code,
        path: warning.path,
        method: warning.method,
        operationId: warning.operationId
      })),
      expectedWarnings
    )
  }).pipe(
    Effect.provide(OpenApiGenerator.layerTransformerTs)
  )
}

const regressionSpec: OpenAPISpec = {
  openapi: "3.1.0",
  info: {
    title: "Regression API",
    version: "1.0.0"
  },
  paths: {
    "/users/{id}": {
      get: {
        operationId: "getUser",
        summary: "Get user",
        description: "Read a user",
        parameters: [
          {
            name: "id",
            in: "path",
            schema: {
              type: "string"
            },
            required: true
          },
          {
            name: "filter",
            in: "query",
            schema: {
              type: "string"
            },
            required: false
          },
          {
            name: "trace-id",
            in: "header",
            schema: {
              type: "string"
            },
            required: false
          },
          {
            name: "session",
            in: "cookie",
            schema: {
              type: "string"
            },
            required: false
          }
        ],
        responses: {
          default: {
            description: "Default user response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string"
                    }
                  },
                  required: ["id"],
                  additionalProperties: false
                }
              }
            }
          }
        } as any,
        tags: ["Users"],
        security: [{ apiKey: [] }]
      }
    }
  },
  components: {
    schemas: {},
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        name: "x-api-key",
        in: "header"
      }
    }
  },
  security: [],
  tags: [{ name: "Users" }]
}

const responseMatchingSpec: OpenAPISpec = {
  openapi: "3.1.0",
  info: {
    title: "Response matching API",
    version: "1.0.0"
  },
  paths: {
    "/auth/device/token": {
      post: {
        operationId: "pollDeviceToken",
        parameters: [],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          400: {
            description: "Problem details or OAuth polling state",
            content: {
              "application/problem+json": {
                schema: {
                  type: "object",
                  properties: {
                    kind: { const: "InvalidRequestError" },
                    code: { type: "string" }
                  },
                  required: ["kind", "code"],
                  additionalProperties: false
                }
              },
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    kind: { const: "DeviceTokenOAuthError" },
                    error: { type: "string" }
                  },
                  required: ["kind", "error"],
                  additionalProperties: false
                }
              }
            }
          }
        }
      }
    },
    "/archive": {
      get: {
        operationId: "downloadArchive",
        parameters: [],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          200: {
            description: "Archive",
            content: {
              "application/zip": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          404: {
            description: "Not found",
            content: {
              "application/problem+json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" }
                  },
                  required: ["title"],
                  additionalProperties: false
                }
              }
            }
          }
        }
      }
    },
    "/avatar": {
      get: {
        operationId: "downloadAvatar",
        parameters: [],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          200: {
            description: "Avatar",
            content: {
              "image/png": {
                schema: { type: "string" }
              }
            }
          }
        }
      }
    },
    "/custom-binary": {
      get: {
        operationId: "downloadCustomBinary",
        parameters: [],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          200: {
            description: "Custom binary",
            content: {
              "application/vnd.example.data": {
                schema: { type: "string", format: "binary" }
              }
            }
          }
        }
      }
    },
    "/mixed-content": {
      get: {
        operationId: "downloadMixedContent",
        parameters: [],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          200: {
            description: "JSON metadata or binary content",
            content: {
              "application/json; charset=utf-8": {
                schema: {
                  type: "object",
                  properties: { href: { type: "string" } },
                  required: ["href"],
                  additionalProperties: false
                }
              },
              "application/octet-stream; boundary=payload": {
                schema: { type: "string" }
              }
            }
          },
          400: {
            description: "Invalid request",
            content: {
              "application/problem+json; charset=utf-8": {
                schema: {
                  type: "object",
                  properties: { title: { type: "string" } },
                  required: ["title"],
                  additionalProperties: false
                }
              }
            }
          }
        }
      }
    },
    "/resources/{id}": {
      head: {
        operationId: "checkResource",
        parameters: [{
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" }
        }],
        tags: ["ResponseMatching"],
        security: [],
        responses: {
          200: { description: "Exists" },
          404: { description: "Not found" },
          500: { description: "Server error" }
        }
      }
    }
  },
  components: {
    schemas: {},
    securitySchemes: {}
  },
  security: [],
  tags: [{ name: "ResponseMatching" }]
}

const voidSuccessSpec: OpenAPISpec = {
  openapi: "3.1.0",
  info: {
    title: "Void success API",
    version: "1.0.0"
  },
  paths: {
    "/mixed": {
      get: {
        operationId: "mixedSuccess",
        parameters: [],
        tags: ["VoidSuccess"],
        security: [],
        responses: {
          200: {
            description: "JSON value",
            content: {
              "application/json": {
                schema: { type: "string" }
              }
            }
          },
          204: { description: "No content" }
        }
      }
    },
    "/cached": {
      get: {
        operationId: "cached",
        parameters: [],
        tags: ["VoidSuccess"],
        security: [],
        responses: {
          304: { description: "Not modified" }
        }
      }
    }
  },
  components: {
    schemas: {},
    securitySchemes: {}
  },
  security: [],
  tags: [{ name: "VoidSuccess" }]
}

function multipartSpec(schema: JsonSchema.JsonSchema, schemas: JsonSchema.Definitions = {}): OpenAPISpec {
  return {
    openapi: "3.1.0",
    info: { title: "Upload API", version: "1.0.0" },
    paths: {
      "/upload": {
        post: {
          operationId: "upload",
          parameters: [],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema } }
          },
          responses: { "204": { description: "Uploaded" } },
          tags: ["Upload"],
          security: []
        }
      }
    },
    components: { schemas, securitySchemes: {} },
    security: [],
    tags: [{ name: "Upload" }]
  }
}

// spawnSync blocks this worker, so compilation must not consume another test's deadline.
describe("OpenApiGenerator", { concurrent: false }, () => {
  describe("schema", () => {
    it.effect("get operation", () =>
      assertRuntime(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/users/{id}": {
              get: {
                operationId: "getUser",
                parameters: [
                  {
                    name: "id",
                    in: "path",
                    schema: {
                      type: "string"
                    },
                    required: true
                  }
                ],
                responses: {
                  200: {
                    description: "User retrieved successfully",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            id: {
                              type: "string"
                            },
                            name: {
                              type: "string"
                            }
                          },
                          required: ["id", "name"],
                          additionalProperties: false,
                          description: "User object"
                        }
                      }
                    }
                  }
                },
                tags: ["Users"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        `import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { SchemaError } from "effect/Schema"
import * as Schema from "effect/Schema"
import type * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
// schemas
export type GetUser200 = { readonly "id": string, readonly "name": string }
export const GetUser200 = Schema.Struct({ "id": Schema.String, "name": Schema.String }).annotate({ "description": "User object" })

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to \`true\`, a tuple of \`[A, HttpClientResponse]\` will be returned,
   * where \`A\` is the success type of the operation.
   *
   * If set to \`false\`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the \`includeResponse\` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig | undefined> = Config extends {
  readonly includeResponse: true
} ? [A, HttpClientResponse.HttpClientResponse]
  : Config extends { readonly includeResponse?: false | undefined } | undefined ? A
  : A | [A, HttpClientResponse.HttpClientResponse]

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>) | undefined
  } = {}
): TestClient => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description: typeof description === "string" ? description : JSON.stringify(description),
            }),
          }),
        ),
    )
  const withResponse = <Config extends OperationConfig>(config: Config | undefined) => (
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>,
  ): (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any> => {
    const withOptionalResponse = (
      config?.includeResponse
        ? (response: HttpClientResponse.HttpClientResponse) => Effect.map(f(response), (a) => [a, response])
        : (response: HttpClientResponse.HttpClientResponse) => f(response)
    ) as any
    return options?.transformClient
      ? (request) =>
          Effect.flatMap(
            Effect.flatMap(options.transformClient!(httpClient), (client) => client.execute(request)),
            withOptionalResponse
          )
      : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse)
  }
  const __encodePathParam = encodeURIComponent
  const __makePathRequest = (
    method: (url: string) => HttpClientRequest.HttpClientRequest,
    parameters: ReadonlyArray<string>,
    getPath: () => string,
  ) => Effect.suspend(() => {
    const fail = (description: string, cause?: unknown) => Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.InvalidUrlError({
          request: method(""),
          cause,
          description,
        }),
      }),
    )
    if (parameters.some((value) => value === "" || /^(?:\\.|%2e){1,2}$/i.test(value))) {
      return fail("Path parameters must be non-empty and cannot be dot segments")
    }
    let path: string
    try {
      path = getPath()
    } catch (cause) {
      return fail("Failed to encode path parameter", cause)
    }
    if (path.split("/").some((segment) => /^(?:\\.|%2e){1,2}$/i.test(segment))) {
      return fail("Request paths cannot contain dot segments")
    }
    return Effect.succeed(method(path))
  })
  const decodeSuccess =
    <Schema extends Schema.Constraint>(schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response)
  const decodeError =
    <const Tag extends string, Schema extends Schema.Constraint>(tag: Tag, schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(schema)(response),
        (cause) => Effect.fail(TestClientError(tag, cause, response)),
      )
  return {
    httpClient,
    "getUser": (id, options: Parameters<TestClient["getUser"]>[1]) => __makePathRequest(HttpClientRequest.get, [id], () => "/users/" + __encodePathParam(id) + "").pipe(
    Effect.flatMap((request) => request.pipe(
      withResponse(options?.config)(HttpClientResponse.matchStatus({
      "2xx": decodeSuccess(GetUser200),
      orElse: unexpectedStatus
    }))
    ))
  )
  }
}

export interface TestClient {
  readonly httpClient: HttpClient.HttpClient
  readonly "getUser": {
    <Config extends OperationConfig | undefined = undefined>(id: string, options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<typeof GetUser200.Type, Config>, HttpClientError.HttpClientError | SchemaError>;
    <Config extends OperationConfig | undefined = undefined>(id: string, options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<typeof GetUser200.Type, Config | undefined>, HttpClientError.HttpClientError | SchemaError>;
  }
}

export interface TestClientError<Tag extends string, E> {
  readonly _tag: Tag
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly cause: E
}

class TestClientErrorImpl extends Data.Error<{
  _tag: string
  cause: any
  request: HttpClientRequest.HttpClientRequest
  response: HttpClientResponse.HttpClientResponse
}> {}

export const TestClientError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): TestClientError<Tag, E> =>
  new TestClientErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any`
      ))

    it.effect("resolves JSON Pointer-escaped local references", () =>
      assertRuntimeIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/widgets": {
              get: {
                operationId: "listWidgets",
                parameters: [
                  { $ref: "#/components/parameters/Page~1Limit" } as any,
                  { $ref: "#/components/parameters/Tilde~0Name" } as any
                ],
                responses: {
                  204: {
                    description: "No content"
                  }
                },
                tags: ["Widgets"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            parameters: {
              "Page/Limit": {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" }
              },
              "Tilde~Name": {
                name: "tilde",
                in: "query",
                required: false,
                schema: { type: "string" }
              }
            }
          } as any,
          security: [],
          tags: [{ name: "Widgets" }]
        },
        [
          `readonly "limit"?: number`,
          `readonly "tilde"?: string`,
          `HttpClientRequest.setUrlParams({ "limit": options?.params?.["limit"] as any, "tilde": options?.params?.["tilde"] as any })`
        ]
      ))

    it.effect("sse operation decodes event payload from json string", () =>
      assertRuntimeIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/events": {
              get: {
                operationId: "streamEvents",
                parameters: [],
                responses: {
                  200: {
                    description: "Events streamed successfully",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "object",
                          properties: {
                            type: {
                              type: "string"
                            },
                            value: {
                              type: "string"
                            }
                          },
                          required: ["type", "value"],
                          additionalProperties: false
                        }
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        [
          `import * as Sse from "effect/encoding/Sse"`,
          `readonly "streamEventsSse": () => Stream.Stream<{ readonly event: string; readonly id: string | undefined; readonly data: typeof StreamEvents200Sse.Type }, HttpClientError.HttpClientError | SchemaError | Sse.Retry | Sse.SseError, typeof StreamEvents200Sse.DecodingServices>`,
          `"streamEventsSse": () => HttpClientRequest.get("/events").pipe(`,
          `sseRequest(StreamEvents200Sse)`,
          `schema: Schema.ConstraintDecoder<Type, DecodingServices>`
        ]
      ))

    it.effect("annotated sse operation decodes the full event schema", () =>
      assertRuntimeIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/events": {
              get: {
                operationId: "streamEvents",
                parameters: [],
                responses: {
                  200: {
                    description: "Events streamed successfully",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "object",
                          properties: {
                            id: {
                              anyOf: [{ type: "string" }, { type: "null" }]
                            },
                            event: { const: "message" },
                            data: { type: "string" }
                          },
                          required: ["id", "event", "data"],
                          additionalProperties: false
                        },
                        "x-effect-stream": {
                          encoding: "sse",
                          errorSchema: {},
                          causeSchema: {},
                          failureEvent: "effect/http-api/stream/failure"
                        }
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        [
          `"id": Schema.optionalKey(Schema.String), "event": Schema.Literal("message"), "data": Schema.String`,
          `"id": Schema.optionalKey(Schema.String), "event": Schema.Literal("effect/http-api/stream/failure"), "data": Schema.String`,
          `readonly "streamEventsSse": () => Stream.Stream<typeof StreamEvents200Sse.Type, HttpClientError.HttpClientError | SchemaError | Sse.Retry | Sse.SseError, typeof StreamEvents200Sse.DecodingServices>`,
          `sseEventRequest(StreamEvents200Sse)`,
          `Stream.pipeThroughChannel(Sse.decodeSchema(schema))`
        ]
      ))

    it.effect("form-urlencoded request body generates bodyUrlParams", () =>
      assertRuntimeIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/auth/token": {
              post: {
                operationId: "issueToken",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "application/x-www-form-urlencoded": {
                      schema: {
                        type: "object",
                        properties: {
                          grant_type: { type: "string" },
                          client_id: { type: "string" }
                        },
                        required: ["grant_type", "client_id"],
                        additionalProperties: false
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Token response",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            access_token: { type: "string" }
                          },
                          required: ["access_token"],
                          additionalProperties: false
                        }
                      }
                    }
                  }
                },
                tags: ["Auth"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        [
          `HttpClientRequest.bodyUrlParams(options.payload as any)`,
          `readonly payload: typeof IssueTokenRequestFormUrlEncoded.Encoded`
        ]
      ))

    it.effect("preserves response variants and routes binary and bodiless statuses", () =>
      assertRuntimeIncludes(responseMatchingSpec, [
        `export const PollDeviceToken400 = Schema.Union(`,
        `Schema.Literal("InvalidRequestError")`,
        `Schema.Literal("DeviceTokenOAuthError")`,
        `"400": decodeError("PollDeviceToken400", PollDeviceToken400)`,
        `export type DownloadArchive404 = { readonly "title": string }`,
        `const decodeBinary = (response: HttpClientResponse.HttpClientResponse) =>`,
        `Effect.map(response.arrayBuffer, (buffer) => new Uint8Array(buffer))`,
        `"2xx": decodeBinary`,
        `readonly "downloadArchive": {`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<Uint8Array, Config>`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<Uint8Array, Config | undefined>`,
        `readonly "downloadArchiveStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `readonly "downloadAvatarStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `"downloadAvatar": (options: Parameters<TestClient["downloadAvatar"]>[0]) => HttpClientRequest.get("/avatar").pipe(
      withResponse(options?.config)(HttpClientResponse.matchStatus({
      "2xx": decodeBinary`,
        `readonly "downloadCustomBinaryStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `"400": decodeError("DownloadMixedContent400", DownloadMixedContent400)`,
        `readonly "downloadMixedContent": {`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<Uint8Array, Config>`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<Uint8Array, Config | undefined>`,
        `readonly "downloadMixedContentStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `"200": () => Effect.void`,
        `"404": decodeVoidError("404")`,
        `"500": decodeVoidError("500")`,
        `TestClientError<"404", undefined>`,
        `TestClientError<"500", undefined>`
      ], [
        `"200": decodeSuccess(DownloadMixedContent200)`,
        `typeof DownloadMixedContent200.Type | Uint8Array`
      ]))

    it.effect("routes mixed and non-2xx bodiless success responses", () =>
      assertRuntimeIncludes(voidSuccessSpec, [
        `"200": decodeSuccess(MixedSuccess200)`,
        `"204": () => Effect.void`,
        `"304": () => Effect.void`,
        `WithOptionalResponse<typeof MixedSuccess200.Type | void, Config>`
      ]))
  })

  describe("type-only", () => {
    it.effect("get operation", () =>
      assertTypeOnly(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/users/{id}": {
              get: {
                operationId: "getUser",
                parameters: [
                  {
                    name: "id",
                    in: "path",
                    schema: {
                      type: "string"
                    },
                    required: true
                  }
                ],
                responses: {
                  200: {
                    description: "User retrieved successfully",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            id: {
                              type: "string"
                            },
                            name: {
                              type: "string"
                            }
                          },
                          required: ["id", "name"],
                          additionalProperties: false
                        }
                      }
                    }
                  }
                },
                tags: ["Users"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        `import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
// schemas
export type GetUser200 = { readonly "id": string, readonly "name": string }

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to \`true\`, a tuple of \`[A, HttpClientResponse]\` will be returned,
   * where \`A\` is the success type of the operation.
   *
   * If set to \`false\`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the \`includeResponse\` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig | undefined> = Config extends {
  readonly includeResponse: true
} ? [A, HttpClientResponse.HttpClientResponse]
  : Config extends { readonly includeResponse?: false | undefined } | undefined ? A
  : A | [A, HttpClientResponse.HttpClientResponse]

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>) | undefined
  } = {}
): TestClient => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description: typeof description === "string" ? description : JSON.stringify(description),
            }),
          }),
        ),
    )
  const withResponse = <Config extends OperationConfig>(config: Config | undefined) => (
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>,
  ): (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any> => {
    const withOptionalResponse = (
      config?.includeResponse
        ? (response: HttpClientResponse.HttpClientResponse) => Effect.map(f(response), (a) => [a, response])
        : (response: HttpClientResponse.HttpClientResponse) => f(response)
    ) as any
    return options?.transformClient
      ? (request) =>
          Effect.flatMap(
            Effect.flatMap(options.transformClient!(httpClient), (client) => client.execute(request)),
            withOptionalResponse
          )
      : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse)
  }
  const __encodePathParam = encodeURIComponent
  const __makePathRequest = (
    method: (url: string) => HttpClientRequest.HttpClientRequest,
    parameters: ReadonlyArray<string>,
    getPath: () => string,
  ) => Effect.suspend(() => {
    const fail = (description: string, cause?: unknown) => Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.InvalidUrlError({
          request: method(""),
          cause,
          description,
        }),
      }),
    )
    if (parameters.some((value) => value === "" || /^(?:\\.|%2e){1,2}$/i.test(value))) {
      return fail("Path parameters must be non-empty and cannot be dot segments")
    }
    let path: string
    try {
      path = getPath()
    } catch (cause) {
      return fail("Failed to encode path parameter", cause)
    }
    if (path.split("/").some((segment) => /^(?:\\.|%2e){1,2}$/i.test(segment))) {
      return fail("Request paths cannot contain dot segments")
    }
    return Effect.succeed(method(path))
  })
  const decodeSuccess = <A>(response: HttpClientResponse.HttpClientResponse) =>
    response.json as Effect.Effect<A, HttpClientError.HttpClientError>
  const decodeVoid = (_response: HttpClientResponse.HttpClientResponse) =>
    Effect.void
  const decodeError =
    <Tag extends string, E>(tag: Tag) =>
    (
      response: HttpClientResponse.HttpClientResponse,
    ): Effect.Effect<
      never,
      TestClientError<Tag, E> | HttpClientError.HttpClientError
    > =>
      Effect.flatMap(
        response.json as Effect.Effect<E, HttpClientError.HttpClientError>,
        (cause) => Effect.fail(TestClientError(tag, cause, response)),
      )
  const onRequest = <Config extends OperationConfig>(config: Config | undefined) => (
    successCodes: ReadonlyArray<string>,
    errorCodes?: Record<string, string>,
  ) => {
    const cases: any = { orElse: unexpectedStatus }
    for (const code of successCodes) {
      cases[code] = decodeSuccess
    }
    if (errorCodes) {
      for (const [code, tag] of Object.entries(errorCodes)) {
        cases[code] = decodeError(tag)
      }
    }
    if (successCodes.length === 0) {
      cases["2xx"] = decodeVoid
    }
    return withResponse(config)(HttpClientResponse.matchStatus(cases) as any)
  }
  return {
    httpClient,
    "getUser": (id, options: Parameters<TestClient["getUser"]>[1]) => __makePathRequest(HttpClientRequest.get, [id], () => "/users/" + __encodePathParam(id) + "").pipe(
    Effect.flatMap((request) => request.pipe(
      onRequest(options?.config)(["2xx"])
    ))
  )
  }
}

export interface TestClient {
  readonly httpClient: HttpClient.HttpClient
  readonly "getUser": {
    <Config extends OperationConfig | undefined = undefined>(id: string, options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<GetUser200, Config>, HttpClientError.HttpClientError>;
    <Config extends OperationConfig | undefined = undefined>(id: string, options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<GetUser200, Config | undefined>, HttpClientError.HttpClientError>;
  }
}

export interface TestClientError<Tag extends string, E> {
  readonly _tag: Tag
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly cause: E
}

class TestClientErrorImpl extends Data.Error<{
  _tag: string
  cause: any
  request: HttpClientRequest.HttpClientRequest
  response: HttpClientResponse.HttpClientResponse
}> {}

export const TestClientError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): TestClientError<Tag, E> =>
  new TestClientErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any`
      ))

    it.effect("preserves response variants and routes binary and bodiless statuses", () =>
      assertTypeOnlyIncludes(responseMatchingSpec, [
        `export type PollDeviceToken400 =`,
        `readonly "kind": "InvalidRequestError"`,
        `readonly "kind": "DeviceTokenOAuthError"`,
        `onRequest(options?.config)([], {"400":"PollDeviceToken400"})`,
        `const decodeBinary = (response: HttpClientResponse.HttpClientResponse) =>`,
        `onRequest(options?.config)([], {"404":"DownloadArchive404"}, {"binary":["2xx"],"voidSuccess":[],"voidError":[]})`,
        `readonly "downloadArchive": {`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<Uint8Array, Config>`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<Uint8Array, Config | undefined>`,
        `readonly "downloadAvatarStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `"downloadAvatar": (options: Parameters<TestClient["downloadAvatar"]>[0]) => HttpClientRequest.get("/avatar").pipe(
      onRequest(options?.config)([], undefined, {"binary":["2xx"],"voidSuccess":[],"voidError":[]})`,
        `readonly "downloadCustomBinaryStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `import * as HttpClient from "effect/http/HttpClient"`,
        `onRequest(options?.config)([], {"400":"DownloadMixedContent400"}, {"binary":["2xx"],"voidSuccess":[],"voidError":[]})`,
        `readonly "downloadMixedContent": {`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config: Config }): Effect.Effect<WithOptionalResponse<Uint8Array, Config>`,
        `<Config extends OperationConfig | undefined = undefined>(options: { readonly config?: Config | undefined } | undefined): Effect.Effect<WithOptionalResponse<Uint8Array, Config | undefined>`,
        `readonly "downloadMixedContentStream": () => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`,
        `onRequest(options?.config)([], undefined, {"binary":[],"voidSuccess":["200"],"voidError":["404","500"]})`,
        `cases[code] = decodeVoidError(code)`,
        `TestClientError<"404", undefined>`,
        `TestClientError<"500", undefined>`
      ], [
        `DownloadMixedContent200 | Uint8Array`
      ]))

    it.effect("routes mixed and non-2xx bodiless success responses", () =>
      assertTypeOnlyIncludes(voidSuccessSpec, [
        `onRequest(options?.config)(["200"], undefined, {"binary":[],"voidSuccess":["204"],"voidError":[]})`,
        `onRequest(options?.config)([], undefined, {"binary":[],"voidSuccess":["304"],"voidError":[]})`,
        `WithOptionalResponse<MixedSuccess200 | void, Config>`
      ]))

    it.effect(
      "emits compilable clients for schema-backed and type-only formats",
      () => assertGeneratedClientsCompile(responseMatchingSpec),
      compilationTimeout
    )
  })

  describe("httpapi", () => {
    it.effect("generates tagged groups with endpoint annotations and representable parameters", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0",
            summary: "Summary",
            description: "Description"
          },
          paths: {
            "/users/{id}": {
              get: {
                operationId: "getUser",
                summary: "Get user",
                description: "Read a user",
                deprecated: true,
                externalDocs: {
                  url: "https://example.com/get-user"
                },
                parameters: [
                  {
                    name: "id",
                    in: "path",
                    schema: { type: "string" },
                    required: true
                  },
                  {
                    name: "filter",
                    in: "query",
                    schema: { type: "string" },
                    required: false
                  },
                  {
                    name: "trace-id",
                    in: "header",
                    schema: { type: "string" },
                    required: false
                  }
                ],
                responses: {
                  200: {
                    description: "User",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            id: { type: "string" }
                          },
                          required: ["id"],
                          additionalProperties: false
                        }
                      }
                    }
                  },
                  404: {
                    description: "Not found"
                  }
                },
                tags: ["Users"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [
            {
              name: "Users",
              description: "User operations",
              externalDocs: {
                url: "https://example.com/users"
              }
            }
          ]
        },
        [
          `import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, HttpApiSecurity, OpenApi } from "effect/http-api"`,
          `export type GetUserPathParams = { readonly "id": string }`,
          `export const GetUserPathParams = Schema.Struct({ "id": Schema.String })`,
          `class UsersGroup extends HttpApiGroup.make("Users")`,
          `.annotate(OpenApi.Description, "User operations")`,
          `.annotate(OpenApi.ExternalDocs, {"url":"https://example.com/users"})`,
          `HttpApiEndpoint.get("getUser", "/users/:id", { params: GetUserPathParams, query: GetUserQuery, headers: GetUserHeaders, success: GetUser200, error: HttpApiSchema.Empty(404) })`,
          `.annotate(OpenApi.Identifier, "getUser")`,
          `.annotate(OpenApi.Summary, "Get user")`,
          `.annotate(OpenApi.Description, "Read a user")`,
          `.annotate(OpenApi.Deprecated, true)`,
          `.annotate(OpenApi.ExternalDocs, {"url":"https://example.com/get-user"})`,
          `export class TestClient extends HttpApi.make("TestClient")`,
          `.annotate(OpenApi.Title, "Test API")`,
          `.annotate(OpenApi.Version, "1.0.0")`,
          `.annotate(OpenApi.Summary, "Summary")`,
          `.annotate(OpenApi.Description, "Description")`,
          `.add(UsersGroup)`
        ],
        [
          `export class GetUserPathParams extends Schema.Class<GetUserPathParams>("GetUserPathParams")({ "id": Schema.String }) {}`
        ]
      ))

    it.effect("includes path-level parameters in generated httpapi endpoints", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Discord-style API",
            version: "1.0.0"
          },
          paths: {
            "/applications/{application_id}": {
              parameters: [
                {
                  name: "application_id",
                  in: "path",
                  schema: { type: "string" },
                  required: true
                }
              ],
              get: {
                operationId: "getApplication",
                parameters: [],
                responses: {
                  200: {
                    description: "Application"
                  }
                },
                tags: ["Applications"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Applications" }]
        },
        [
          `export type GetApplicationPathParams = { readonly "application_id": string }`,
          `export const GetApplicationPathParams = Schema.Struct({ "application_id": Schema.String })`,
          `HttpApiEndpoint.get("getApplication", "/applications/:application_id", { params: GetApplicationPathParams, success: HttpApiSchema.Empty(200) })`
        ],
        [
          `export class GetApplicationPathParams extends Schema.Class<GetApplicationPathParams>("GetApplicationPathParams")({ "application_id": Schema.String }) {}`
        ]
      ))

    it.effect("creates top-level fallback group for untagged operations", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/health": {
              get: {
                operationId: "getHealth",
                parameters: [],
                responses: {
                  204: {
                    description: "No content"
                  }
                },
                tags: [] as any,
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        [
          `class DefaultGroup extends HttpApiGroup.make("default", { topLevel: true })`,
          `HttpApiEndpoint.get("getHealth", "/health", { success: HttpApiSchema.Empty(204) })`,
          `.add(DefaultGroup)`
        ]
      ))

    it.effect("keeps the fallback group top-level when tagged default operations are present", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/tagged": {
              get: {
                operationId: "getTagged",
                parameters: [],
                responses: {
                  200: {
                    description: "Tagged"
                  }
                },
                tags: ["default"],
                security: []
              }
            },
            "/untagged": {
              get: {
                operationId: "getUntagged",
                parameters: [],
                responses: {
                  204: {
                    description: "Untagged"
                  }
                },
                tags: [] as any,
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        [
          `class DefaultGroup extends HttpApiGroup.make("default", { topLevel: true })`,
          `HttpApiEndpoint.get("getTagged", "/tagged", { success: HttpApiSchema.Empty(200) })`,
          `HttpApiEndpoint.get("getUntagged", "/untagged", { success: HttpApiSchema.Empty(204) })`,
          `.add(DefaultGroup)`
        ]
      ))

    it.effect("maps request and response encodings including optional request body approximation", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/payload": {
              post: {
                operationId: "createPayload",
                parameters: [],
                requestBody: {
                  required: false,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          a: { type: "string" }
                        },
                        required: ["a"],
                        additionalProperties: false
                      }
                    },
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        properties: {
                          file: { type: "string", format: "binary" },
                          files: {
                            type: "array",
                            items: { type: "string", format: "binary" }
                          }
                        },
                        required: ["file", "files"],
                        additionalProperties: false
                      }
                    },
                    "application/x-www-form-urlencoded": {
                      schema: {
                        type: "object",
                        properties: {
                          form: { type: "string" }
                        },
                        required: ["form"],
                        additionalProperties: false
                      }
                    },
                    "text/plain": {
                      schema: {
                        type: "string"
                      }
                    },
                    "application/octet-stream": {
                      schema: {
                        type: "string",
                        format: "binary"
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Payload",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            ok: { type: "boolean" }
                          },
                          required: ["ok"],
                          additionalProperties: false
                        }
                      },
                      "text/plain": {
                        schema: {
                          type: "string"
                        }
                      },
                      "application/octet-stream": {
                        schema: {
                          type: "string",
                          format: "binary"
                        }
                      }
                    }
                  },
                  201: {
                    description: "Created"
                  }
                },
                tags: ["Payload"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Payload" }]
        },
        [
          `import { Multipart } from "effect/http"`,
          `export type __HttpApiMultipartSingleFile = Multipart.PersistedFile
export const __HttpApiMultipartSingleFile = Multipart.SingleFileSchema`,
          `export type __HttpApiMultipartFiles = ReadonlyArray<Multipart.PersistedFile>
export const __HttpApiMultipartFiles = Multipart.FilesSchema`,
          `export type CreatePayloadRequestFormData = { readonly "file": __HttpApiMultipartSingleFile, readonly "files": __HttpApiMultipartFiles }`,
          `export const CreatePayloadRequestFormData = Schema.Struct({ "file": __HttpApiMultipartSingleFile, "files": __HttpApiMultipartFiles })`,
          `export type CreatePayloadRequestJson = { readonly "a": string }`,
          `export type CreatePayloadRequestText = string
export const CreatePayloadRequestText = Schema.String`,
          `payload: [HttpApiSchema.NoContent, CreatePayloadRequestJson, CreatePayloadRequestFormData.pipe(HttpApiSchema.asMultipart()), CreatePayloadRequestFormUrlEncoded.pipe(HttpApiSchema.asFormUrlEncoded()), CreatePayloadRequestText.pipe(HttpApiSchema.asText()), CreatePayloadRequestBinary.pipe(HttpApiSchema.asUint8Array())]`,
          `success: [CreatePayload200, CreatePayload200Text.pipe(HttpApiSchema.asText()), CreatePayload200Binary.pipe(HttpApiSchema.asUint8Array()), HttpApiSchema.Empty(201)]`
        ],
        [
          "Schema.Opaque",
          `extends Schema.Class<CreatePayloadRequestJson>("CreatePayloadRequestJson")`
        ]
      ))

    it.effect("preserves multiple JSON response representations with application/json preferred", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/dual": {
              get: {
                operationId: "dualJson",
                parameters: [],
                responses: {
                  200: {
                    description: "Dual JSON response",
                    content: {
                      "application/problem+json": {
                        schema: {
                          type: "object",
                          properties: {
                            title: { type: "string" }
                          },
                          required: ["title"],
                          additionalProperties: false
                        }
                      },
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            value: { type: "string" }
                          },
                          required: ["value"],
                          additionalProperties: false
                        }
                      }
                    }
                  }
                },
                tags: ["DualJson"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "DualJson" }]
        },
        [
          `export type DualJson200 = { readonly "value": string }`,
          `export type DualJson200ApplicationProblemJson = { readonly "title": string }`,
          `HttpApiEndpoint.get("dualJson", "/dual", { success: [DualJson200, DualJson200ApplicationProblemJson.pipe(HttpApiSchema.asJson({ contentType: "application/problem+json" }))] })`
        ]
      ))

    it.effect("maps explicit SSE stream responses to HttpApiSchema.StreamSse", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/events": {
              get: {
                operationId: "streamEvents",
                parameters: [],
                responses: {
                  200: {
                    description: "Events",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "object",
                          properties: {
                            event: { const: "message" },
                            data: { type: "string" }
                          },
                          required: ["event", "data"],
                          additionalProperties: false
                        },
                        "x-effect-stream": {
                          encoding: "sse",
                          errorSchema: {
                            type: "object",
                            properties: {
                              message: { type: "string" }
                            },
                            required: ["message"],
                            additionalProperties: false
                          },
                          causeSchema: {
                            type: "object"
                          },
                          failureEvent: "effect/http-api/stream/failure"
                        }
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            },
            "/events/custom": {
              get: {
                operationId: "streamEventsCustom",
                parameters: [],
                responses: {
                  200: {
                    description: "Custom events",
                    content: {
                      "application/custom-sse": {
                        schema: {
                          type: "object",
                          properties: {
                            event: { const: "message" },
                            data: { type: "string" }
                          },
                          required: ["event", "data"],
                          additionalProperties: false
                        },
                        "x-effect-stream": {
                          encoding: "sse",
                          errorSchema: {
                            type: "object",
                            properties: {
                              message: { type: "string" }
                            },
                            required: ["message"],
                            additionalProperties: false
                          },
                          causeSchema: {
                            type: "object"
                          },
                          failureEvent: "effect/http-api/stream/failure"
                        }
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Events" }]
        },
        [
          `HttpApiEndpoint.get("streamEvents", "/events", { success: HttpApiSchema.StreamSse({ events: StreamEvents200Sse, error: StreamEvents200SseError }) })`,
          `HttpApiEndpoint.get("streamEventsCustom", "/events/custom", { success: HttpApiSchema.StreamSse({ contentType: "application/custom-sse", events: StreamEventsCustom200Sse, error: StreamEventsCustom200SseError }) })`
        ],
        [
          `StreamEvents200Sse.pipe(HttpApiSchema.asText())`,
          `StreamEventsCustom200ApplicationCustomSse.pipe(HttpApiSchema.asText({ contentType: "application/custom-sse" }))`
        ]
      ))

    it.effect("warns and skips unannotated successful SSE responses in HttpApi generation", () =>
      assertHttpApiWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/events": {
              get: {
                operationId: "streamEvents",
                parameters: [],
                responses: {
                  200: {
                    description: "Events",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "string"
                        }
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            },
            "/events/cause-only": {
              get: {
                operationId: "streamEventsCauseOnly",
                parameters: [],
                responses: {
                  200: {
                    description: "Events",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "string"
                        },
                        "x-effect-stream": {
                          encoding: "sse",
                          causeSchema: {
                            type: "object"
                          },
                          failureEvent: "effect/http-api/stream/failure"
                        } as any
                      }
                    }
                  }
                },
                tags: ["Events"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Events" }]
        },
        {
          excludes: [
            `HttpApiEndpoint.get("streamEvents", "/events"`,
            `HttpApiEndpoint.get("streamEventsCauseOnly", "/events/cause-only"`
          ],
          warnings: [
            {
              code: "sse-operation-skipped",
              path: "/events",
              method: "get",
              operationId: "streamEvents"
            },
            {
              code: "sse-operation-skipped",
              path: "/events/cause-only",
              method: "get",
              operationId: "streamEventsCauseOnly"
            }
          ]
        }
      ))

    it.effect("maps explicit uint8array stream responses to HttpApiSchema.StreamUint8Array", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/download": {
              get: {
                operationId: "download",
                parameters: [],
                responses: {
                  200: {
                    description: "Download",
                    content: {
                      "application/octet-stream": {
                        schema: {
                          type: "string",
                          format: "binary"
                        },
                        "x-effect-stream": {
                          encoding: "uint8array"
                        }
                      }
                    }
                  }
                },
                tags: ["Downloads"],
                security: []
              }
            },
            "/download/custom": {
              get: {
                operationId: "downloadCustom",
                parameters: [],
                responses: {
                  200: {
                    description: "Custom download",
                    content: {
                      "application/custom-bytes": {
                        schema: {
                          type: "string",
                          format: "binary"
                        },
                        "x-effect-stream": {
                          encoding: "uint8array"
                        }
                      }
                    }
                  }
                },
                tags: ["Downloads"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Downloads" }]
        },
        [
          `HttpApiEndpoint.get("download", "/download", { success: HttpApiSchema.StreamUint8Array() })`,
          `HttpApiEndpoint.get("downloadCustom", "/download/custom", { success: HttpApiSchema.StreamUint8Array({ contentType: "application/custom-bytes" }) })`
        ],
        [
          `Download200Binary.pipe(HttpApiSchema.asUint8Array())`,
          `DownloadCustom200ApplicationCustomBytes.pipe(HttpApiSchema.asUint8Array({ contentType: "application/custom-bytes" }))`
        ]
      ))

    it.effect("keeps unannotated octet-stream responses as buffered Uint8Array schemas", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/download/buffered": {
              get: {
                operationId: "downloadBuffered",
                parameters: [],
                responses: {
                  200: {
                    description: "Buffered download",
                    content: {
                      "application/octet-stream": {
                        schema: {
                          type: "string",
                          format: "binary"
                        }
                      }
                    }
                  }
                },
                tags: ["Downloads"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Downloads" }]
        },
        [
          `HttpApiEndpoint.get("downloadBuffered", "/download/buffered", { success: DownloadBuffered200Binary.pipe(HttpApiSchema.asUint8Array()) })`
        ],
        [
          `HttpApiSchema.StreamUint8Array()`
        ]
      ))

    it.effect("maps multipart schemas referenced through components to Multipart file schemas", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/upload": {
              post: {
                operationId: "upload",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        $ref: "#/components/schemas/UploadBody"
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Uploaded"
                  }
                },
                tags: ["Payload"],
                security: []
              }
            }
          },
          components: {
            schemas: {
              UploadBody: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" }
                  }
                },
                required: ["file", "files"],
                additionalProperties: false
              }
            },
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Payload" }]
        },
        [
          `import { Multipart } from "effect/http"`,
          `export type __HttpApiMultipartSingleFile = Multipart.PersistedFile
export const __HttpApiMultipartSingleFile = Multipart.SingleFileSchema`,
          `export type __HttpApiMultipartFiles = ReadonlyArray<Multipart.PersistedFile>
export const __HttpApiMultipartFiles = Multipart.FilesSchema`,
          `export type UploadRequestFormData = { readonly "file": __HttpApiMultipartSingleFile, readonly "files": __HttpApiMultipartFiles }`,
          `export const UploadRequestFormData = Schema.Struct({ "file": __HttpApiMultipartSingleFile, "files": __HttpApiMultipartFiles })`,
          `HttpApiEndpoint.post("upload", "/upload", { payload: UploadRequestFormData.pipe(HttpApiSchema.asMultipart()), success: HttpApiSchema.Empty(200) })`
        ],
        [
          `Schema.String.annotate({ "format": "binary" })`,
          `export type UploadBody =`
        ]
      ))

    it.effect("preserves multipart component reference siblings", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/upload": {
              post: {
                operationId: "upload",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        properties: {
                          first: {
                            $ref: "#/components/schemas/UploadBody",
                            minProperties: 1,
                            description: "First upload"
                          },
                          second: {
                            $ref: "#/components/schemas/UploadBody",
                            minProperties: 2,
                            description: "Second upload"
                          }
                        },
                        required: ["first", "second"],
                        additionalProperties: false
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Uploaded"
                  }
                },
                tags: ["Payload"],
                security: []
              }
            }
          },
          components: {
            schemas: {
              UploadBody: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" }
                },
                required: ["file"],
                additionalProperties: false
              }
            },
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Payload" }]
        },
        [
          `"first": Schema.Struct({ "file": __HttpApiMultipartSingleFile })`,
          `Schema.isMinProperties(1)`,
          `"description": "First upload"`,
          `"second": Schema.Struct({ "file": __HttpApiMultipartSingleFile })`,
          `Schema.isMinProperties(2)`,
          `"description": "Second upload"`
        ]
      ))

    it.effect("preserves multipart component alias siblings", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/upload": {
              post: {
                operationId: "upload",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        $ref: "#/components/schemas/UploadAlias"
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Uploaded"
                  }
                },
                tags: ["Payload"],
                security: []
              }
            }
          },
          components: {
            schemas: {
              UploadAlias: {
                $ref: "#/components/schemas/UploadBody",
                minProperties: 1,
                description: "Aliased upload"
              },
              UploadBody: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" }
                },
                required: ["file"],
                additionalProperties: false
              }
            },
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Payload" }]
        },
        [
          `export type UploadRequestFormData = { readonly "file": __HttpApiMultipartSingleFile }`,
          `Schema.isMinProperties(1)`,
          `"description": "Aliased upload"`
        ],
        [
          `export type UploadAlias =`,
          `export type UploadBody =`
        ]
      ))

    it.effect("maps multipart contentEncoding binary schemas (case-insensitive) to Multipart file schemas", () =>
      assertHttpApiIncludes(
        {
          openapi: "3.1.0",
          info: {
            title: "Test API",
            version: "1.0.0"
          },
          paths: {
            "/upload-content-encoding": {
              post: {
                operationId: "uploadWithContentEncoding",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        $ref: "#/components/schemas/UploadBodyContentEncoding"
                      }
                    }
                  }
                } as any,
                responses: {
                  200: {
                    description: "Uploaded"
                  }
                },
                tags: ["Payload"],
                security: []
              }
            }
          },
          components: {
            schemas: {
              UploadBodyContentEncoding: {
                type: "object",
                properties: {
                  file: { type: "string", contentEncoding: "BINARY" },
                  files: {
                    type: "array",
                    items: { type: "string", contentEncoding: "BINARY" }
                  }
                },
                required: ["file", "files"],
                additionalProperties: false
              }
            },
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Payload" }]
        },
        [
          `import { Multipart } from "effect/http"`,
          `export type UploadWithContentEncodingRequestFormData = { readonly "file": __HttpApiMultipartSingleFile, readonly "files": __HttpApiMultipartFiles }`,
          `export const UploadWithContentEncodingRequestFormData = Schema.Struct({ "file": __HttpApiMultipartSingleFile, "files": __HttpApiMultipartFiles })`,
          `HttpApiEndpoint.post("uploadWithContentEncoding", "/upload-content-encoding", { payload: UploadWithContentEncodingRequestFormData.pipe(HttpApiSchema.asMultipart()), success: HttpApiSchema.Empty(200) })`
        ],
        [
          `contentEncoding`,
          `export type UploadBodyContentEncoding =`
        ]
      ))

    it.effect("generates security declarations and middleware placeholders", () =>
      assertHttpApiWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Security API",
            version: "1.0.0"
          },
          paths: {
            "/secure": {
              get: {
                operationId: "getSecure",
                parameters: [],
                responses: {
                  200: {
                    description: "Secure"
                  }
                },
                tags: ["Security"],
                security: [
                  { apiKeyAuth: [] },
                  { bearerAuth: [] },
                  { apiKeyAuth: [], basicAuth: [] }
                ]
              }
            },
            "/public": {
              get: {
                operationId: "getPublic",
                parameters: [],
                responses: {
                  200: {
                    description: "Public"
                  }
                },
                tags: ["Security"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {
              apiKeyAuth: {
                type: "apiKey",
                name: "x-api-key",
                in: "header",
                description: "API key"
              },
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Bearer token"
              },
              basicAuth: {
                type: "http",
                scheme: "basic"
              }
            }
          },
          security: [],
          tags: [{ name: "Security" }]
        },
        {
          includes: [
            `const ApiKeyAuthSecurity = HttpApiSecurity.apiKey({ key: "x-api-key", in: "header" }).pipe(HttpApiSecurity.annotate(OpenApi.Description, "API key"))`,
            `const BearerAuthSecurity = HttpApiSecurity.bearer.pipe(HttpApiSecurity.annotate(OpenApi.Description, "Bearer token")).pipe(HttpApiSecurity.annotate(OpenApi.Format, "JWT"))`,
            `const BasicAuthSecurity = HttpApiSecurity.basic`,
            `class ApiKeyAuthOrBearerAuthSecurityMiddleware extends HttpApiMiddleware.Service<ApiKeyAuthOrBearerAuthSecurityMiddleware>()("apiKeyAuth | bearerAuth security", { security: { "apiKeyAuth": ApiKeyAuthSecurity, "bearerAuth": BearerAuthSecurity } }) {}`,
            `class ApiKeyAuthAndBasicAuthSecurityMiddleware extends HttpApiMiddleware.Service<ApiKeyAuthAndBasicAuthSecurityMiddleware>()("apiKeyAuth & basicAuth security") {}`,
            `HttpApiEndpoint.get("getSecure", "/secure", { success: HttpApiSchema.Empty(200) })\n      .middleware(ApiKeyAuthOrBearerAuthSecurityMiddleware)\n      .middleware(ApiKeyAuthAndBasicAuthSecurityMiddleware)`,
            `HttpApiEndpoint.get("getPublic", "/public", { success: HttpApiSchema.Empty(200) })`
          ],
          excludes: [
            `HttpApiEndpoint.get("getPublic", "/public", { success: HttpApiSchema.Empty(200) })\n      .middleware(`
          ],
          warnings: [
            {
              code: "security-and-downgraded",
              path: "/secure",
              method: "get",
              operationId: "getSecure"
            }
          ]
        }
      ))

    it.effect("generates custom http security schemes", () =>
      assertHttpApiWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Custom Security API",
            version: "1.0.0"
          },
          paths: {
            "/secure": {
              get: {
                operationId: "getSecure",
                parameters: [],
                responses: {
                  200: {
                    description: "Secure"
                  }
                },
                tags: ["Security"],
                security: [{ digestAuth: [] }]
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {
              digestAuth: {
                type: "http",
                scheme: "Digest",
                bearerFormat: "DigestToken",
                description: "Digest token"
              }
            }
          },
          security: [],
          tags: [{ name: "Security" }]
        },
        {
          includes: [
            `const DigestAuthSecurity = HttpApiSecurity.http({ scheme: "Digest" }).pipe(HttpApiSecurity.annotate(OpenApi.Description, "Digest token")).pipe(HttpApiSecurity.annotate(OpenApi.Format, "DigestToken"))`,
            `class DigestAuthSecurityMiddleware extends HttpApiMiddleware.Service<DigestAuthSecurityMiddleware>()("digestAuth security", { security: { "digestAuth": DigestAuthSecurity } }) {}`
          ],
          warnings: []
        }
      ))

    it.effect("inherits global security and respects operation-level clearing", () =>
      assertHttpApiWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Security inheritance API",
            version: "1.0.0"
          },
          paths: {
            "/inherited": {
              get: {
                operationId: "getInherited",
                parameters: [],
                responses: {
                  200: {
                    description: "Inherited"
                  }
                },
                tags: ["Security"]
              } as any
            },
            "/inherited-two": {
              get: {
                operationId: "getInheritedTwo",
                parameters: [],
                responses: {
                  200: {
                    description: "Inherited two"
                  }
                },
                tags: ["Security"]
              } as any
            },
            "/cleared": {
              get: {
                operationId: "getCleared",
                parameters: [],
                responses: {
                  200: {
                    description: "Cleared"
                  }
                },
                tags: ["Security"],
                security: []
              }
            },
            "/anonymous": {
              get: {
                operationId: "getAnonymous",
                parameters: [],
                responses: {
                  200: {
                    description: "Anonymous"
                  }
                },
                tags: ["Security"],
                security: [{}]
              }
            },
            "/override": {
              get: {
                operationId: "getOverride",
                parameters: [],
                responses: {
                  200: {
                    description: "Override"
                  }
                },
                tags: ["Security"],
                security: [{ bearerAuth: [] }]
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {
              apiKeyAuth: {
                type: "apiKey",
                name: "x-api-key",
                in: "header"
              },
              bearerAuth: {
                type: "http",
                scheme: "bearer"
              }
            }
          },
          security: [{ apiKeyAuth: [] }],
          tags: [{ name: "Security" }]
        },
        {
          includes: [
            `class ApiKeyAuthSecurityMiddleware extends HttpApiMiddleware.Service<ApiKeyAuthSecurityMiddleware>()("apiKeyAuth security", { security: { "apiKeyAuth": ApiKeyAuthSecurity } }) {}`,
            `class BearerAuthSecurityMiddleware extends HttpApiMiddleware.Service<BearerAuthSecurityMiddleware>()("bearerAuth security", { security: { "bearerAuth": BearerAuthSecurity } }) {}`,
            `HttpApiEndpoint.get("getInherited", "/inherited", { success: HttpApiSchema.Empty(200) })\n      .middleware(ApiKeyAuthSecurityMiddleware)`,
            `HttpApiEndpoint.get("getInheritedTwo", "/inherited-two", { success: HttpApiSchema.Empty(200) })\n      .middleware(ApiKeyAuthSecurityMiddleware)`,
            `HttpApiEndpoint.get("getCleared", "/cleared", { success: HttpApiSchema.Empty(200) })`,
            `HttpApiEndpoint.get("getAnonymous", "/anonymous", { success: HttpApiSchema.Empty(200) })`,
            `HttpApiEndpoint.get("getOverride", "/override", { success: HttpApiSchema.Empty(200) })\n      .middleware(BearerAuthSecurityMiddleware)`
          ],
          excludes: [
            `HttpApiEndpoint.get("getCleared", "/cleared", { success: HttpApiSchema.Empty(200) })\n      .middleware(`,
            `HttpApiEndpoint.get("getAnonymous", "/anonymous", { success: HttpApiSchema.Empty(200) })\n      .middleware(`
          ],
          occurrences: [
            {
              substring:
                `class ApiKeyAuthSecurityMiddleware extends HttpApiMiddleware.Service<ApiKeyAuthSecurityMiddleware>()("apiKeyAuth security", { security: { "apiKeyAuth": ApiKeyAuthSecurity } }) {}`,
              count: 1
            }
          ],
          warnings: []
        }
      ))

    it.effect("emits lossy warnings and skips unsupported httpapi operations", () =>
      assertHttpApiWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Warnings API",
            version: "1.0.0"
          },
          paths: {
            "/cookies": {
              get: {
                operationId: "getCookie",
                parameters: [
                  {
                    name: "session",
                    in: "cookie",
                    schema: { type: "string" },
                    required: false
                  }
                ],
                responses: {
                  200: {
                    description: "Cookie"
                  }
                },
                tags: ["Warnings"],
                security: []
              }
            },
            "/tags": {
              get: {
                operationId: "getTagged",
                parameters: [],
                responses: {
                  200: {
                    description: "Tagged"
                  }
                },
                tags: ["Warnings", "ExtraTag"],
                security: []
              }
            },
            "/sse": {
              get: {
                operationId: "streamEvents",
                parameters: [],
                responses: {
                  200: {
                    description: "Events",
                    content: {
                      "text/event-stream": {
                        schema: {
                          type: "string"
                        }
                      }
                    }
                  }
                },
                tags: ["Warnings"],
                security: []
              }
            },
            "/headers": {
              get: {
                operationId: "getHeaders",
                parameters: [],
                responses: {
                  200: {
                    description: "Headers",
                    headers: {
                      "x-rate-limit": {
                        schema: {
                          type: "integer"
                        }
                      }
                    }
                  }
                } as any,
                tags: ["Warnings"],
                security: []
              }
            },
            "/default-success": {
              get: {
                operationId: "getDefaultSuccess",
                parameters: [],
                responses: {
                  200: {
                    description: "OK"
                  },
                  default: {
                    description: "Fallback"
                  }
                } as any,
                tags: ["Warnings"],
                security: []
              }
            },
            "/default-only": {
              get: {
                operationId: "getDefaultOnly",
                parameters: [],
                responses: {
                  default: {
                    description: "Fallback"
                  }
                } as any,
                tags: ["Warnings"],
                security: []
              }
            },
            "/nobody": {
              get: {
                operationId: "getNoBody",
                parameters: [],
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          a: { type: "string" }
                        },
                        required: ["a"],
                        additionalProperties: false
                      }
                    }
                  }
                },
                responses: {
                  200: {
                    description: "No body"
                  }
                },
                tags: ["Warnings"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "Warnings" }]
        },
        {
          includes: [
            `HttpApiEndpoint.get("getCookie", "/cookies", { success: HttpApiSchema.Empty(200) })`,
            `HttpApiEndpoint.get("getHeaders", "/headers", { success: HttpApiSchema.Empty(200) })`,
            `HttpApiEndpoint.get("getDefaultSuccess", "/default-success", { success: HttpApiSchema.Empty(200), error: HttpApiSchema.Empty(500) })`,
            `HttpApiEndpoint.get("getDefaultOnly", "/default-only", { success: HttpApiSchema.Empty(200) })`
          ],
          excludes: [
            `HttpApiEndpoint.get("streamEvents", "/sse"`,
            `HttpApiEndpoint.get("getNoBody", "/nobody"`
          ],
          warnings: [
            {
              code: "cookie-parameter-dropped",
              path: "/cookies",
              method: "get",
              operationId: "getCookie"
            },
            {
              code: "additional-tags-dropped",
              path: "/tags",
              method: "get",
              operationId: "getTagged"
            },
            {
              code: "sse-operation-skipped",
              path: "/sse",
              method: "get",
              operationId: "streamEvents"
            },
            {
              code: "response-headers-ignored",
              path: "/headers",
              method: "get",
              operationId: "getHeaders"
            },
            {
              code: "default-response-remapped",
              path: "/default-success",
              method: "get",
              operationId: "getDefaultSuccess"
            },
            {
              code: "default-response-remapped",
              path: "/default-only",
              method: "get",
              operationId: "getDefaultOnly"
            },
            {
              code: "no-body-method-request-body-skipped",
              path: "/nobody",
              method: "get",
              operationId: "getNoBody"
            }
          ]
        }
      ))
  })

  describe("QUERY", () => {
    const queryOperation: OpenAPISpecOperation = {
      operationId: "search",
      parameters: [],
      tags: ["Search"],
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
              additionalProperties: false
            }
          }
        }
      },
      responses: { "204": { description: "No content" } }
    }

    const makeQuerySpec = (pathItem: OpenAPISpecPathItem & { query?: OpenAPISpecOperation }): OpenAPISpec => ({
      openapi: "3.1.0",
      info: { title: "QUERY API", version: "1.0.0" },
      components: { schemas: {}, securitySchemes: {} },
      security: [],
      tags: [{ name: "Search" }],
      paths: {
        "/search": {
          get: {
            operationId: "list",
            parameters: [],
            tags: ["Search"],
            security: [],
            responses: { "204": { description: "No content" } }
          },
          ...pathItem
        }
      }
    })

    it.effect.each([
      {
        name: "OpenAPI 3.1 extension",
        spec: makeQuerySpec({ "x-oai-additionalOperations": { QUERY: queryOperation } })
      },
      {
        name: "native OpenAPI 3.2 field",
        spec: {
          ...makeQuerySpec({
            query: queryOperation,
            "x-oai-additionalOperations": { QUERY: { ...queryOperation, operationId: "legacySearch" } }
          }),
          openapi: "3.2.0"
        } as unknown as OpenAPISpec
      }
    ])("generates QUERY request bodies from the $name", ({ spec }) =>
      Effect.all([
        assertRuntimeIncludes(spec, [
          `HttpClientRequest.get("/search")`,
          `HttpClientRequest.query("/search")`,
          `export const SearchRequestJson = Schema.Struct({ "query": Schema.String })`,
          `HttpClientRequest.bodyJsonUnsafe(options.payload)`,
          `readonly payload: typeof SearchRequestJson.Encoded`
        ], ["legacySearch", "LegacySearch"]),
        assertTypeOnlyIncludes(spec, [
          `HttpClientRequest.get("/search")`,
          `HttpClientRequest.query("/search")`,
          `HttpClientRequest.bodyJsonUnsafe(options.payload)`,
          `export type SearchRequestJson = { readonly "query": string }`,
          `readonly payload: SearchRequestJson`
        ], ["legacySearch", "LegacySearch"]),
        assertHttpApiIncludes(spec, [
          `HttpApiEndpoint.get("list", "/search"`,
          `export const SearchRequestJson = Schema.Struct({ "query": Schema.String })`,
          `HttpApiEndpoint.query("search", "/search", { payload: SearchRequestJson, success: HttpApiSchema.Empty(204) })`
        ], ["legacySearch", "LegacySearch"])
      ]))
  })

  describe("regression", () => {
    for (const format of ["httpclient", "httpclient-type-only"] as const) {
      for (const exactOptionalPropertyTypes of [true, false]) {
        it.effect(
          `preserves includeResponse success types (${format}, exactOptionalPropertyTypes=${exactOptionalPropertyTypes})`,
          () =>
            assertGeneratedClientsCompile({
              openapi: "3.1.0",
              info: { title: "Value", version: "1.0.0" },
              components: { schemas: {}, securitySchemes: {} },
              security: [],
              tags: [],
              paths: {
                "/value": {
                  get: {
                    operationId: "getValue",
                    parameters: [],
                    security: [],
                    tags: ["Value"],
                    responses: {
                      "200": {
                        description: "Value",
                        content: { "application/json": { schema: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }, {
              formats: [format],
              exactOptionalPropertyTypes,
              usage: `type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type WithResponse = [string, HttpClientResponse.HttpClientResponse]
declare const client: TestClient
declare const dynamic: boolean
declare const optionalTrue: { readonly includeResponse?: true }
declare const optionalBoolean: { readonly includeResponse?: boolean }
declare const nullableConfig: { readonly includeResponse: true } | undefined

const enabled = client.getValue({ config: { includeResponse: true } })
const disabled = client.getValue({ config: { includeResponse: false } })
const omitted = client.getValue(undefined)
const emptyOptions = client.getValue({})
const undefinedConfig = client.getValue({ config: undefined })
const dynamicResult = client.getValue({ config: { includeResponse: dynamic } })
const optionalTrueResult = client.getValue({ config: optionalTrue })
const optionalBooleanResult = client.getValue({ config: optionalBoolean })
const nullableConfigResult = client.getValue({ config: nullableConfig })
const conditionalConfig = Math.random() > 0.5 ? { includeResponse: true as const } : undefined
const conditionalConfigResult = client.getValue({ config: conditionalConfig })

export type Enabled = Assert<Equal<Effect.Success<typeof enabled>, WithResponse>>
export type Disabled = Assert<Equal<Effect.Success<typeof disabled>, string>>
export type Omitted = Assert<Equal<Effect.Success<typeof omitted>, string>>
export type EmptyOptions = Assert<Equal<Effect.Success<typeof emptyOptions>, string>>
export type UndefinedConfig = Assert<Equal<Effect.Success<typeof undefinedConfig>, string>>
export type Dynamic = Assert<Equal<Effect.Success<typeof dynamicResult>, string | WithResponse>>
export type OptionalTrue = Assert<Equal<Effect.Success<typeof optionalTrueResult>, string | WithResponse>>
export type OptionalBoolean = Assert<Equal<Effect.Success<typeof optionalBooleanResult>, string | WithResponse>>
export type NullableConfig = Assert<Equal<Effect.Success<typeof nullableConfigResult>, string | WithResponse>>
export type ConditionalConfig = Assert<Equal<Effect.Success<typeof conditionalConfigResult>, string | WithResponse>>
`
            }),
          compilationTimeout
        )
      }
    }

    it.effect("quotes static path text with and without parameters", () => {
      const prefix = "/files/\"`\\\n/"
      const suffix = "/content\"`"
      const operation: OpenAPISpecOperation = {
        operationId: "read",
        parameters: [],
        tags: ["Files"],
        security: [],
        responses: { "204": { description: "No content" } }
      }
      return assertRuntimeIncludes({
        openapi: "3.1.0",
        info: { title: "Quoted paths", version: "1.0.0" },
        components: { schemas: {}, securitySchemes: {} },
        security: [],
        tags: [],
        paths: {
          [prefix + suffix]: { get: operation },
          [prefix + "{id}" + suffix]: {
            get: {
              ...operation,
              operationId: "readById",
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }]
            }
          }
        }
      }, [
        `HttpClientRequest.get(${JSON.stringify(prefix + suffix)})`,
        `() => ${JSON.stringify(prefix)} + __encodePathParam(id) + ${JSON.stringify(suffix)}`
      ])
    })

    it.effect("emits compilable clients when schema examples are invalid", () =>
      assertGeneratedClientsCompile({
        openapi: "3.0.3",
        info: {
          title: "Invalid examples API",
          version: "1.0.0"
        },
        paths: {
          "/triggers": {
            get: {
              operationId: "getTriggers",
              parameters: [],
              responses: {
                200: {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        items: { type: "string" },
                        example: "create"
                      }
                    }
                  }
                }
              },
              tags: ["Triggers"],
              security: []
            }
          }
        },
        components: {
          schemas: {},
          securitySchemes: {}
        },
        security: [],
        tags: [{ name: "Triggers" }]
      } as unknown as OpenAPISpec), compilationTimeout)

    it.effect("runtime warnings do not report additional-tags-dropped outside httpapi", () =>
      assertRuntimeStableWithWarnings(
        {
          openapi: "3.1.0",
          info: {
            title: "Warnings regression API",
            version: "1.0.0"
          },
          paths: {
            "/multi-tag": {
              get: {
                operationId: "getMultiTag",
                parameters: [],
                responses: {
                  200: {
                    description: "OK"
                  }
                },
                tags: ["One", "Two"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: [{ name: "One" }, { name: "Two" }]
        },
        []
      ))

    it.effect("runtime output remains stable when using onWarning", () =>
      assertRuntimeStableWithWarnings(regressionSpec, [
        {
          code: "cookie-parameter-dropped",
          path: "/users/{id}",
          method: "get",
          operationId: "getUser"
        },
        {
          code: "default-response-remapped",
          path: "/users/{id}",
          method: "get",
          operationId: "getUser"
        }
      ]))

    it.effect("type-only output remains stable when using onWarning", () =>
      assertTypeOnlyStableWithWarnings(regressionSpec, [
        {
          code: "cookie-parameter-dropped",
          path: "/users/{id}",
          method: "get",
          operationId: "getUser"
        },
        {
          code: "default-response-remapped",
          path: "/users/{id}",
          method: "get",
          operationId: "getUser"
        }
      ]))

    it.effect("emits compilable open objects with optional properties", () =>
      assertGeneratedClientsCompile(
        {
          openapi: "3.1.0",
          info: {
            title: "Open object regression API",
            version: "1.0.0"
          },
          paths: {
            "/widget": {
              get: {
                operationId: "getWidget",
                parameters: [],
                responses: {
                  200: {
                    description: "OK",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            optionalValue: {
                              type: "string"
                            }
                          },
                          additionalProperties: true
                        }
                      }
                    }
                  }
                },
                tags: ["Widgets"],
                security: []
              }
            }
          },
          components: {
            schemas: {},
            securitySchemes: {}
          },
          security: [],
          tags: []
        },
        {
          exactOptionalPropertyTypes: false,
          formats: ["httpclient"]
        }
      ), compilationTimeout)

    it.effect("types multipart binary fields as File | Blob for generated clients", () =>
      assertGeneratedClientsCompile(
        multipartSpec({
          type: "object",
          properties: { file: { type: "string", format: "binary" } },
          required: ["file"],
          additionalProperties: false
        }),
        {
          usage: `export const withFile: UploadRequestFormData = { file: new File([], "upload.txt") }
export const withBlob: UploadRequestFormData = { file: new Blob([]) }
// @ts-expect-error Binary multipart fields do not accept strings.
export const withString: UploadRequestFormData = { file: "upload.txt" }
`
        }
      ), compilationTimeout)

    it.effect(
      "types recursive multipart binary references as File | Blob for generated clients",
      () =>
        assertGeneratedClientsCompile(
          multipartSpec({ $ref: "#/components/schemas/Node" }, {
            Node: {
              type: "object",
              properties: {
                file: { type: "string", format: "binary" },
                child: { $ref: "#/components/schemas/Node" }
              },
              required: ["file"],
              additionalProperties: false
            }
          }),
          {
            usage: `const file = new File([], "upload.txt")
const blob = new Blob([])
export const payload: UploadRequestFormData = { file, child: { file: blob, child: { file } } }
// @ts-expect-error Recursive binary fields do not accept strings.
export const withString: UploadRequestFormData = { file, child: { file: "upload.txt" } }
`
          }
        ),
      compilationTimeout
    )

    for (
      const [format, assertIncludes] of [
        ["httpclient", assertRuntimeIncludes],
        ["httpclient-type-only", assertTypeOnlyIncludes]
      ] as const
    ) {
      it.effect(`preserves named multipart components without binary fields (${format})`, () =>
        assertIncludes(
          multipartSpec({ $ref: "#/components/schemas/FormBody" }, {
            FormBody: {
              type: "object",
              properties: {
                name: { type: "string" },
                meta: { $ref: "#/components/schemas/Meta" }
              },
              required: ["name"],
              additionalProperties: false
            },
            Meta: {
              type: "object",
              properties: { k: { type: "string" } },
              required: ["k"],
              additionalProperties: false
            }
          }),
          [
            "export type Meta =",
            "export type FormBody =",
            "export type UploadRequestFormData = FormBody"
          ]
        ))
    }

    it.effect(
      "types multipart binary arrays as File | Blob arrays for generated clients",
      () =>
        assertGeneratedClientsCompile(
          multipartSpec({
            type: "object",
            properties: { files: { type: "array", items: { type: "string", format: "binary" } } },
            required: ["files"],
            additionalProperties: false
          }),
          {
            usage: `export const payload: UploadRequestFormData = { files: [new File([], "upload.txt"), new Blob([])] }
// @ts-expect-error Binary multipart arrays do not accept strings.
export const withString: UploadRequestFormData = { files: ["upload.txt"] }
`
          }
        ),
      compilationTimeout
    )
  })
})
