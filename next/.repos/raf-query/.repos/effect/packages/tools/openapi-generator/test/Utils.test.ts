import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import * as Utils from "@effect/openapi-generator/Utils"
import { assert, describe, expect, it } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Sse from "effect/encoding/Sse"
import type { OpenAPISpec } from "effect/http-api/OpenApi"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { rolldown } from "rolldown"

const modules = {
  "effect/Data": Data,
  "effect/Effect": Effect,
  "effect/Schema": Schema,
  "effect/Stream": Stream,
  "effect/encoding/Sse": Sse,
  "effect/http/HttpClient": HttpClient,
  "effect/http/HttpClientError": HttpClientError,
  "effect/http/HttpClientRequest": HttpClientRequest,
  "effect/http/HttpClientResponse": HttpClientResponse
}

async function loadClient(source: string, httpClient: HttpClient.HttpClient) {
  const bundle = await rolldown({
    input: "client.ts",
    external: (id) => id !== "client.ts",
    plugins: [{
      name: "generated-client",
      resolveId: (id) => id === "client.ts" ? id : undefined,
      load: (id) => id === "client.ts" ? source : undefined
    }]
  })
  const { output } = await bundle.generate({ format: "cjs" })
  await bundle.close()
  const compiled = output[0]
  assert.strictEqual(compiled.type, "chunk")
  const exports = {} as {
    make: (httpClient: HttpClient.HttpClient) => {
      submit: (options: { payload: { name: string } }) => Effect.Effect<unknown, unknown>
      submitSse: (options: { payload: { name: string } }) => Stream.Stream<unknown, unknown>
      submitStream: (options: { payload: { name: string } }) => Stream.Stream<unknown, unknown>
    }
  }
  new Function("require", "exports", compiled.code)(
    (id: keyof typeof modules) => {
      assert.property(modules, id)
      return modules[id]
    },
    exports
  )
  return exports.make(httpClient)
}

describe("Utils", () => {
  describe("camelize", () => {
    it("removes hyphens and capitalizes following letters", () => {
      expect(Utils.camelize("my-operation-id")).toBe("myOperationId")
    })

    it("removes slashes and capitalizes following letters", () => {
      expect(Utils.camelize("my/operation/id")).toBe("myOperationId")
    })

    it("handles numbers", () => {
      expect(Utils.camelize("operation-2")).toBe("operation2")
    })

    it("removes leading numbers", () => {
      expect(Utils.camelize("2operation")).toBe("operation")
    })

    it("handles empty string", () => {
      expect(Utils.camelize("")).toBe("")
    })
  })

  describe("identifier", () => {
    it("capitalizes camelized string", () => {
      expect(Utils.identifier("my-operation")).toBe("MyOperation")
      expect(Utils.identifier("operation-2")).toBe("Operation2")
    })
  })

  describe("generated request encoding", () => {
    for (const format of ["httpclient", "httpclient-type-only"] as const) {
      for (const method of ["submit", "submitSse", "submitStream"] as const) {
        it.effect(`${format} ${method} sends form-urlencoded payloads`, () =>
          Effect.gen(function*() {
            const responseContentType = method === "submitSse"
              ? "text/event-stream"
              : method === "submitStream"
              ? "application/octet-stream"
              : "application/json"
            const spec: OpenAPISpec = {
              openapi: "3.1.0",
              info: { title: "Form API", version: "1.0.0" },
              components: { schemas: {}, securitySchemes: {} },
              security: [],
              tags: [],
              paths: {
                "/submit": {
                  post: {
                    operationId: "submit",
                    parameters: [],
                    tags: ["Forms"],
                    security: [],
                    requestBody: {
                      required: true,
                      content: {
                        "application/x-www-form-urlencoded": {
                          schema: {
                            type: "object",
                            properties: { name: { type: "string" } },
                            required: ["name"]
                          }
                        }
                      }
                    },
                    responses: {
                      "200": {
                        description: "Success",
                        content: { [responseContentType]: { schema: { type: "string" } } }
                      }
                    }
                  }
                }
              }
            }
            const generator = yield* OpenApiGenerator.OpenApiGenerator
            const source = yield* generator.generate(spec, { name: "TestClient", format })
            const requests: Array<HttpClientRequest.HttpClientRequest> = []
            const httpClient = HttpClient.make((request) => {
              requests.push(request)
              return Effect.succeed(HttpClientResponse.fromWeb(
                request,
                new Response(method === "submitSse" ? "data: \"ok\"\n\n" : "\"ok\"", {
                  headers: { "content-type": responseContentType }
                })
              ))
            }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("https://example.test")))
            const client = yield* Effect.promise(() => loadClient(source, httpClient))
            const options = { payload: { name: "Ada Lovelace" } }
            if (method === "submit") {
              yield* client.submit(options)
            } else {
              yield* Stream.runDrain(client[method](options))
            }
            assert.strictEqual(requests.length, 1)
            const request = yield* HttpClientRequest.toWeb(requests[0])
            assert.deepStrictEqual({
              contentType: request.headers.get("content-type"),
              body: yield* Effect.promise(() => request.text())
            }, {
              contentType: "application/x-www-form-urlencoded",
              body: "name=Ada+Lovelace"
            })
          }).pipe(Effect.provide(
            format === "httpclient" ? OpenApiGenerator.layerTransformerSchema : OpenApiGenerator.layerTransformerTs
          )))
      }
    }
  })

  it.effect("encodes multipart record payloads as form data", () =>
    Effect.gen(function*() {
      const spec: OpenAPISpec = {
        openapi: "3.1.0",
        info: { title: "Form API", version: "1.0.0" },
        components: { schemas: {}, securitySchemes: {} },
        security: [],
        tags: [],
        paths: {
          "/submit": {
            post: {
              operationId: "submit",
              parameters: [],
              tags: ["Forms"],
              security: [],
              requestBody: {
                required: true,
                content: {
                  "multipart/form-data": {
                    schema: {
                      type: "object",
                      properties: { name: { type: "string" } },
                      required: ["name"]
                    }
                  }
                }
              },
              responses: {
                "200": {
                  description: "Success",
                  content: { "application/json": { schema: { type: "string" } } }
                }
              }
            }
          }
        }
      }
      const generator = yield* OpenApiGenerator.OpenApiGenerator
      const source = yield* generator.generate(spec, { name: "TestClient", format: "httpclient" })
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const httpClient = HttpClient.make((request) => {
        requests.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(
          request,
          new Response("\"ok\"", { headers: { "content-type": "application/json" } })
        ))
      }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("https://example.test")))
      const client = yield* Effect.promise(() => loadClient(source, httpClient))

      yield* client.submit({ payload: { name: "Ada Lovelace" } })

      assert.strictEqual(requests.length, 1)
      const request = yield* HttpClientRequest.toWeb(requests[0])
      const body = yield* Effect.promise(() => request.clone().text())
      assert.notStrictEqual(body, "[object Object]")
      const formData = yield* Effect.promise(() => request.formData())
      assert.deepStrictEqual(Array.from(formData.entries()), [["name", "Ada Lovelace"]])
    }).pipe(Effect.provide(OpenApiGenerator.layerTransformerSchema)))
})
