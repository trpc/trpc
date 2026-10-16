import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { Multipart } from "effect/http"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  OpenApi
} from "effect/http-api"

describe("OpenAPI spec", () => {
  describe("api", () => {
    it("annotate", () => {
      const Api = HttpApi.make("api")
        .annotate(OpenApi.Title, "title")
        .annotate(OpenApi.Version, "version")
        .annotate(OpenApi.Description, "description")
        .annotate(OpenApi.License, { name: "license" })
        .annotate(OpenApi.Summary, "summary")
        .annotate(OpenApi.Servers, [{ url: "https://example.com" }])
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.info.title, "title")
      assert.deepStrictEqual(spec.info.version, "version")
      assert.deepStrictEqual(spec.info.description, "description")
      assert.deepStrictEqual(spec.info.license, { name: "license" })
      assert.deepStrictEqual(spec.info.summary, "summary")
      assert.deepStrictEqual(spec.servers, [{ url: "https://example.com" }])
    })

    it("annotateMerge", () => {
      const Api = HttpApi.make("api").annotateMerge(OpenApi.annotations({
        title: "title",
        version: "version",
        description: "description",
        license: { name: "license" },
        summary: "summary",
        servers: [{ url: "https://example.com" }]
      }))
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.info.title, "title")
      assert.deepStrictEqual(spec.info.version, "version")
      assert.deepStrictEqual(spec.info.description, "description")
      assert.deepStrictEqual(spec.info.license, { name: "license" })
      assert.deepStrictEqual(spec.info.summary, "summary")
      assert.deepStrictEqual(spec.servers, [{ url: "https://example.com" }])
    })

    it("AdditionalSchemas", () => {
      const Api = HttpApi.make("api")
        .annotate(HttpApi.AdditionalSchemas, [Schema.String.annotate({ identifier: "A" })])
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.components.schemas, {
        A: {
          "type": "string"
        }
      })
    })

    it("Override", () => {
      const Api = HttpApi.make("api")
        .annotate(OpenApi.Override, {
          tags: [{ name: "A" }]
        })
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.tags, [{ name: "A" }])
    })

    it("Transform", () => {
      const Api = HttpApi.make("api")
        .annotate(OpenApi.Transform, (spec) => ({
          ...spec,
          tags: [{ name: "A" }]
        }))
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.tags, [{ name: "A" }])
    })
  })

  describe("group", () => {
    it("annotations", () => {
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            // Add a description for the group
            .annotate(OpenApi.Description, "my description")
            // Provide external documentation links
            .annotate(OpenApi.ExternalDocs, {
              url: "http://example.com",
              description: "example"
            })
            // Override parts of the final output
            .annotate(OpenApi.Override, { name: "my name" })
            // Transform the final specification for this group
            .annotate(OpenApi.Transform, (spec) => ({
              ...spec,
              name: spec.name + "-transformed"
            }))
        )
        .add(
          HttpApiGroup.make("excluded")
            // Exclude the group from the final specification
            .annotate(OpenApi.Exclude, true)
        )
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec, {
        "openapi": "3.1.0",
        "info": {
          "title": "Api",
          "version": "0.0.1"
        },
        "paths": {},
        "components": {
          "schemas": {},
          "securitySchemes": {}
        },
        "security": [],
        "tags": [
          {
            "name": "my name-transformed",
            "description": "my description",
            "externalDocs": {
              "url": "http://example.com",
              "description": "example"
            }
          }
        ]
      })
    })

    it("top level group", () => {
      const Api = HttpApi.make("api").add(
        // Mark the group as top-level
        HttpApiGroup.make("group", { topLevel: true }).add(
          HttpApiEndpoint.get("get", "/", {
            success: Schema.String
          })
        )
      )
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.paths, {
        "/": {
          "get": {
            "tags": [
              "group"
            ],
            "operationId": "get",
            "parameters": [],
            "security": [],
            "responses": {
              "200": {
                "description": "Success",
                "content": {
                  "application/json": {
                    "schema": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      })
    })
  })

  describe("endpoint", () => {
    describe("annotations", () => {
      it("endpoint annotations", () => {
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("get", "/", {
                success: Schema.String
              })
                // Add a description
                .annotate(OpenApi.Description, "my description")
                // Provide a summary
                .annotate(OpenApi.Summary, "my summary")
                // Mark the endpoint as deprecated
                .annotate(OpenApi.Deprecated, true)
                // Provide external documentation
                .annotate(OpenApi.ExternalDocs, {
                  url: "http://example.com",
                  description: "example"
                })
            )
            .add(
              HttpApiEndpoint.get("excluded", "/excluded", {
                success: Schema.String
              })
                // Exclude this endpoint from the final specification
                .annotate(OpenApi.Exclude, true)
            )
        )
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec, {
          "openapi": "3.1.0",
          "info": {
            "title": "Api",
            "version": "0.0.1"
          },
          "paths": {
            "/": {
              "get": {
                "tags": [
                  "group"
                ],
                "operationId": "group.get",
                "parameters": [],
                "security": [],
                "responses": {
                  "200": {
                    "description": "Success",
                    "content": {
                      "application/json": {
                        "schema": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                "description": "my description",
                "summary": "my summary",
                "deprecated": true,
                "externalDocs": {
                  "url": "http://example.com",
                  "description": "example"
                }
              }
            }
          },
          "components": {
            "schemas": {},
            "securitySchemes": {}
          },
          "security": [],
          "tags": [
            {
              "name": "group"
            }
          ]
        })
      })

      it("success description", () => {
        const User = Schema.Struct({
          id: Schema.Finite,
          name: Schema.String
        }).annotate({ identifier: "User" })

        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("group").add(
            HttpApiEndpoint.get("getUsers", "/users", {
              success: Schema.Array(User).annotate({
                description: "Returns an array of users"
              })
            })
          )
        )
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec.paths, {
          "/users": {
            "get": {
              "tags": [
                "group"
              ],
              "operationId": "group.getUsers",
              "parameters": [],
              "security": [],
              "responses": {
                "200": {
                  "description": "Returns an array of users",
                  "content": {
                    "application/json": {
                      "schema": {
                        "type": "array",
                        "items": {
                          "$ref": "#/components/schemas/User"
                        },
                        "description": "Returns an array of users"
                      }
                    }
                  }
                }
              }
            }
          }
        })
        assert.deepStrictEqual(spec.components.schemas, {
          User: {
            "type": "object",
            "properties": {
              "id": {
                "type": "number"
              },
              "name": {
                "type": "string"
              }
            },
            "required": [
              "id",
              "name"
            ],
            "additionalProperties": false
          }
        })
      })
    })

    it("catch all path", () => {
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "*", {
                success: Schema.String
              })
            )
        )
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.paths["*"].get?.responses, {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                "type": "string"
              }
            }
          }
        }
      })
    })

    it("middleware error", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger", {
        error: Schema.String
          .pipe(
            HttpApiSchema.status(405),
            HttpApiSchema.asText()
          )
      }) {}

      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Finite
              })
            ).middleware(M)
        )
      const spec = OpenApi.fromApi(Api)
      assert.deepStrictEqual(spec.paths["/a"].get?.responses, {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                "type": "number"
              }
            }
          }
        },
        "405": {
          description: "Error",
          content: {
            "text/plain": {
              schema: {
                "type": "string"
              }
            }
          }
        }
      })
    })

    describe("params option", () => {
      it("GET", () => {
        const Api = HttpApi.make("api")
          .add(
            HttpApiGroup.make("group")
              .add(
                HttpApiEndpoint.get("a", "/a/:id", {
                  params: {
                    id: Schema.FiniteFromString
                  }
                })
              )
          )
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec.paths["/a/{id}"].get?.parameters, [
          {
            name: "id",
            in: "path",
            schema: {
              "type": "string"
            },
            required: true
          }
        ])
      })
    })

    describe("payload option", () => {
      describe("GET", () => {
        it("query parameters", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    payload: {
                      required: Schema.FiniteFromString,
                      optionalKey: Schema.optionalKey(Schema.FiniteFromString),
                      optional: Schema.optional(Schema.FiniteFromString)
                    }
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.parameters, [
            {
              name: "required",
              in: "query",
              schema: {
                "type": "string"
              },
              required: true
            },
            {
              name: "optionalKey",
              in: "query",
              schema: {
                "type": "string"
              },
              required: false
            },
            {
              name: "optional",
              in: "query",
              schema: {
                "anyOf": [
                  { "type": "string" },
                  { "type": "null" }
                ]
              },
              required: false
            }
          ])
        })
      })

      describe("POST", () => {
        it("NoContent", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.post("a", "/a", { payload: HttpApiSchema.NoContent }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.requestBody, undefined)
        })

        it("NoContent + payload", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.post("a", "/a", { payload: [HttpApiSchema.NoContent, Schema.String] }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
            "application/json": {
              schema: {
                "type": "string"
              }
            }
          })
        })

        it("Json (default)", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.post("a", "/a", {
                    payload: Schema.String
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
            "application/json": {
              schema: {
                "type": "string"
              }
            }
          })
        })

        describe("encodings", () => {
          it("asMultipart", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.String.pipe(HttpApiSchema.asMultipart())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "multipart/form-data": {
                schema: {
                  "type": "string"
                }
              }
            })
          })

          it("asMultipartStream", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.String.pipe(HttpApiSchema.asMultipartStream())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "multipart/form-data": {
                schema: {
                  "type": "string"
                }
              }
            })
          })

          it("asJson + contentType", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.String.pipe(
                        HttpApiSchema.asJson({ contentType: "application/problem+json" })
                      )
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "application/problem+json": {
                schema: {
                  "type": "string"
                }
              }
            })
          })

          it("asText", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.String.pipe(HttpApiSchema.asText())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "text/plain": {
                schema: {
                  "type": "string"
                }
              }
            })
          })

          it("asFormUrlEncoded", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.Struct({ a: Schema.String }).pipe(
                        HttpApiSchema.asFormUrlEncoded()
                      )
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "application/x-www-form-urlencoded": {
                schema: {
                  "type": "object",
                  "properties": {
                    "a": {
                      "type": "string"
                    }
                  },
                  "required": ["a"],
                  "additionalProperties": false
                }
              }
            })
          })

          it("asUint8Array", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "application/octet-stream": {
                schema: {
                  "type": "string",
                  "format": "binary"
                }
              }
            })
          })

          it("array of schemas with different encodings", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: [
                        Schema.Struct({ a: Schema.String }), // application/json
                        Schema.String.pipe(HttpApiSchema.asText()), // text/plain
                        Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
                      ]
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "application/json": {
                schema: {
                  "type": "object",
                  "properties": {
                    "a": {
                      "type": "string"
                    }
                  },
                  "required": ["a"],
                  "additionalProperties": false
                }
              },
              "text/plain": {
                schema: {
                  "type": "string"
                }
              },
              "application/octet-stream": {
                schema: {
                  "type": "string",
                  "format": "binary"
                }
              }
            })
          })

          it("asMultipart with FilesSchema", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Multipart.FilesSchema.pipe(HttpApiSchema.asMultipart())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "multipart/form-data": {
                schema: {
                  type: "array",
                  items: {
                    type: "string",
                    format: "binary"
                  }
                }
              }
            })
          })

          it("asMultipart with SingleFileSchema", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Multipart.SingleFileSchema.pipe(HttpApiSchema.asMultipart())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "multipart/form-data": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            })
          })

          it("asMultipart with SingleFileSchema in Struct", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.Struct({
                        file: Multipart.SingleFileSchema
                      }).pipe(HttpApiSchema.asMultipart())
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary"
                    }
                  },
                  required: ["file"],
                  additionalProperties: false
                }
              }
            })
          })

          it("FilesSchema in non-multipart payload should not be converted to binary", () => {
            const Api = HttpApi.make("api")
              .add(
                HttpApiGroup.make("group")
                  .add(
                    HttpApiEndpoint.post("a", "/a", {
                      payload: Schema.Struct({
                        files: Multipart.FilesSchema
                      })
                    })
                  )
              )
            const spec = OpenApi.fromApi(Api)
            assert.deepStrictEqual(spec.paths["/a"].post?.requestBody?.content, {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    files: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { "type": "string" },
                          name: { "type": "string" },
                          contentType: { type: "string", contentEncoding: "binary" },
                          path: { "type": "string" }
                        },
                        required: ["key", "name", "contentType", "path"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["files"],
                  additionalProperties: false
                }
              }
            })
          })
        })
      })
    })

    describe("success option", () => {
      it("no content (default)", () => {
        const Api = HttpApi.make("api")
          .add(
            HttpApiGroup.make("group")
              .add(HttpApiEndpoint.get("a", "/a"))
          )
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec.paths["/a"].get?.responses["204"], {
          description: "<No Content>"
        })
      })

      it("schema", () => {
        const Api = HttpApi.make("api")
          .add(
            HttpApiGroup.make("group")
              .add(HttpApiEndpoint.get("a", "/a", {
                success: Schema.String
              }))
          )
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
          "application/json": {
            schema: {
              "type": "string"
            }
          }
        })
      })

      describe("NoContent", () => {
        it("makeNoContent(204)", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.get("a", "/a", {
                  success: HttpApiSchema.Empty(204)
                }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["204"], {
            description: "<No Content>"
          })
        })

        it("NoContent", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.get("a", "/a", {
                  success: HttpApiSchema.NoContent
                }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["204"], {
            description: "<No Content>"
          })
        })

        it("Created", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.get("a", "/a", {
                  success: HttpApiSchema.Created
                }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["201"], {
            description: "<No Content>"
          })
        })

        it("status(\"Created\")", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.get("a", "/a", {
                  success: Schema.Void.pipe(HttpApiSchema.status("Created"))
                }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["201"], {
            description: "<No Content>"
          })
        })

        it("Accepted", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(HttpApiEndpoint.get("a", "/a", {
                  success: HttpApiSchema.Accepted
                }))
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["202"], {
            description: "<No Content>"
          })
        })
      })

      describe("encodings", () => {
        it("asJson + contentType", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: Schema.String.pipe(
                      HttpApiSchema.asJson({ contentType: "application/problem+json" })
                    )
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/problem+json": {
              schema: {
                "type": "string"
              }
            }
          })
        })

        it("asText", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: Schema.String.pipe(HttpApiSchema.asText())
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "text/plain": {
              schema: {
                "type": "string"
              }
            }
          })
        })

        it("asFormUrlEncoded", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: Schema.Struct({ a: Schema.String }).pipe(
                      HttpApiSchema.asFormUrlEncoded()
                    )
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/x-www-form-urlencoded": {
              schema: {
                "type": "object",
                "properties": {
                  "a": {
                    "type": "string"
                  }
                },
                "required": ["a"],
                "additionalProperties": false
              }
            }
          })
        })

        it("asUint8Array", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/octet-stream": {
              schema: {
                "type": "string",
                "format": "binary"
              }
            }
          })
        })

        it("StreamSse", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: HttpApiSchema.StreamSse({
                      events: Schema.Struct({
                        event: Schema.Literal("message"),
                        data: Schema.String
                      }),
                      error: Schema.Struct({
                        message: Schema.String
                      })
                    })
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          const mediaType = spec.paths["/a"].get?.responses["200"].content?.["text/event-stream"]
          const stream = mediaType?.["x-effect-stream"]
          assert.strictEqual(stream?.encoding, "sse")
          if (stream?.encoding !== "sse") {
            assert.fail("expected SSE stream metadata")
          }
          assert.strictEqual(stream.failureEvent, "effect/http-api/stream/failure")
          assert.strictEqual(typeof stream.causeSchema, "object")
          assert.strictEqual(typeof stream.errorSchema, "object")
        })

        it("StreamSse with annotated status", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: HttpApiSchema.status(202)(
                      HttpApiSchema.StreamSse({
                        events: Schema.Struct({
                          event: Schema.Literal("message"),
                          data: Schema.String
                        }),
                        error: Schema.Struct({
                          message: Schema.String
                        })
                      })
                    )
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.strictEqual(spec.paths["/a"].get?.responses["200"], undefined)
          assert.strictEqual(
            spec.paths["/a"].get?.responses["202"].content?.["text/event-stream"]?.["x-effect-stream"]?.encoding,
            "sse"
          )
        })

        it("StreamUint8Array", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: HttpApiSchema.StreamUint8Array()
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/octet-stream": {
              schema: {
                "type": "string",
                "format": "binary"
              },
              "x-effect-stream": {
                encoding: "uint8array"
              }
            }
          })
        })

        it("StreamUint8Array with annotated status", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: HttpApiSchema.status(206)(HttpApiSchema.StreamUint8Array())
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.strictEqual(spec.paths["/a"].get?.responses["200"], undefined)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["206"].content, {
            "application/octet-stream": {
              schema: {
                "type": "string",
                "format": "binary"
              },
              "x-effect-stream": {
                encoding: "uint8array"
              }
            }
          })
        })

        it("union with top level encoding", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: Schema.Union([
                      Schema.Struct({ a: Schema.String }),
                      Schema.Struct({ b: Schema.String })
                    ]).pipe(HttpApiSchema.asFormUrlEncoded())
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/x-www-form-urlencoded": {
              schema: {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "a": {
                        "type": "string"
                      }
                    },
                    "required": ["a"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "b": {
                        "type": "string"
                      }
                    },
                    "required": ["b"],
                    "additionalProperties": false
                  }
                ]
              }
            }
          })
        })

        it("asJson + astText", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    success: [
                      Schema.String,
                      Schema.String.pipe(
                        HttpApiSchema.asText()
                      )
                    ]
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["200"].content, {
            "application/json": {
              "schema": {
                "type": "string"
              }
            },
            "text/plain": {
              "schema": {
                "type": "string"
              }
            }
          })
        })
      })
    })

    describe("error option", () => {
      it("should deduplicate the descriptions", () => {
        class Group extends HttpApiGroup.make("users")
          .add(HttpApiEndpoint.post("a", "/a", {
            error: HttpApiError.BadRequestNoContent
          }))
        {}

        class Api extends HttpApi.make("api").add(Group) {}
        const spec = OpenApi.fromApi(Api)
        assert.deepStrictEqual(spec.paths["/a"].post?.responses["400"], {
          description: "BadRequest"
        })
        assert.deepStrictEqual(spec.components.schemas, {})
      })

      describe("1 endopoint", () => {
        it("no identifier annotation", () => {
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: Schema.String
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {})
        })

        it("identifier annotation", () => {
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: Schema.String.annotate({ identifier: "id" })
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "id",
              content: {
                "application/json": {
                  schema: {
                    "$ref": "#/components/schemas/id"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {
            id: {
              "type": "string"
            }
          })
        })

        it("httpApiStatus annotation", () => {
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: Schema.String.annotate({ httpApiStatus: 400 })
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "400": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {})
        })
      })

      describe("2 endopoints", () => {
        it("no identifier annotation", () => {
          const E = Schema.String
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
            .add(HttpApiEndpoint.post("b", "/b", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.paths["/b"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {})
        })

        it("identifier annotation", () => {
          const E = Schema.String.annotate({ identifier: "id" })
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
            .add(HttpApiEndpoint.post("b", "/b", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "id",
              content: {
                "application/json": {
                  schema: {
                    "$ref": "#/components/schemas/id"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.paths["/b"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "500": {
              description: "id",
              content: {
                "application/json": {
                  schema: {
                    "$ref": "#/components/schemas/id"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {
            id: {
              "type": "string"
            }
          })
        })

        it("httpApiStatus annotation", () => {
          const E = Schema.String.annotate({ httpApiStatus: 400 })
          class Group extends HttpApiGroup.make("users")
            .add(HttpApiEndpoint.post("a", "/a", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
            .add(HttpApiEndpoint.post("b", "/b", {
              payload: Schema.String,
              success: Schema.String,
              error: E
            }))
          {}

          class Api extends HttpApi.make("api").add(Group) {}
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "400": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.paths["/b"].post?.responses, {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            },
            "400": {
              description: "Error",
              content: {
                "application/json": {
                  schema: {
                    "type": "string"
                  }
                }
              }
            }
          })
          assert.deepStrictEqual(spec.components.schemas, {})
        })
      })

      describe("No Content", () => {
        it("makeNoContent(400)", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    error: HttpApiSchema.Empty(400)
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["400"], {
            description: "<No Content>"
          })
        })

        it("Empty(401)", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    error: HttpApiSchema.Empty(401)
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["401"], {
            description: "<No Content>"
          })
        })

        it("UnauthorizedNoContent", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    error: HttpApiError.UnauthorizedNoContent
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["401"], {
            description: "Unauthorized"
          })
        })

        it("BadRequestNoContent", () => {
          const Api = HttpApi.make("api")
            .add(
              HttpApiGroup.make("group")
                .add(
                  HttpApiEndpoint.get("a", "/a", {
                    error: HttpApiError.BadRequestNoContent
                  })
                )
            )
          const spec = OpenApi.fromApi(Api)
          assert.deepStrictEqual(spec.paths["/a"].get?.responses["400"], {
            description: "BadRequest"
          })
        })
      })
    })
  })
})
