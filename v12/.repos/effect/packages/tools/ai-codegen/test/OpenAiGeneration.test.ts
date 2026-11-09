import * as Config from "@effect/ai-codegen/Config"
import * as Generator from "@effect/ai-codegen/Generator"
import * as SpecFetcher from "@effect/ai-codegen/SpecFetcher"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { gzipSync } from "node:zlib"

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const object = (properties: Record<string, unknown>, required: ReadonlyArray<string> = []) => ({
  type: "object",
  properties,
  required
})
const string = { type: "string" }
const tag = (value: string) => ({ type: "string", enum: [value] })

interface Case {
  readonly name: string
  readonly schemas: Record<string, unknown>
  readonly valid: ReadonlyArray<unknown>
  readonly invalid: ReadonlyArray<unknown>
}

// Each case mirrors a shape from the canonical OpenAI spec (openai/openai-openapi). The
// last schema is the request body of the only operation, so it is the one decoded.
const cases: ReadonlyArray<Case> = [
  {
    name: "OpenAPI 3.1 keywords such as examples",
    schemas: { Root: object({ name: { type: ["string", "null"], examples: ["a"] } }, ["name"]) },
    valid: [{ name: "a" }, { name: null }],
    invalid: [{ name: 1 }]
  },
  {
    // CreateChatCompletionRequest, Response, *Resource
    name: "allOf of object schemas",
    schemas: {
      Base: object({ temperature: { type: ["number", "null"] } }),
      Root: {
        allOf: [
          ref("Base"),
          object({ model: string, messages: { type: "array", items: string } }, ["model", "messages"])
        ]
      }
    },
    valid: [{ model: "gpt", messages: ["hi"], temperature: 1 }],
    invalid: [{ model: "gpt" }]
  },
  {
    // WebSearchToolCall.action
    name: "object wrapper around oneOf alternatives",
    schemas: {
      Search: object({ type: tag("search"), query: string }, ["type"]),
      OpenPage: object({ type: tag("open_page"), url: string }, ["type"]),
      Root: object({
        action: { type: "object", oneOf: [ref("Search"), ref("OpenPage")], discriminator: { propertyName: "type" } }
      }, ["action"])
    },
    valid: [{ action: { type: "search", query: "q" } }, { action: { type: "open_page", url: "u" } }],
    invalid: [{ action: { type: "find" } }]
  },
  {
    // CreateAssistantRequest.tool_resources.file_search, CreateVectorStoreFileBatchRequest
    name: "properties with required-only oneOf alternatives",
    schemas: {
      Root: {
        type: "object",
        properties: {
          ids: { type: "array", items: string },
          stores: { type: "array", items: object({ metadata: { anyOf: [{ type: "object" }, { type: "null" }] } }) }
        },
        oneOf: [{ required: ["ids"] }, { required: ["stores"] }]
      }
    },
    valid: [{ ids: ["a"] }, { stores: [{ metadata: null }] }],
    invalid: [{}]
  },
  {
    // ComputerUseApprovalResponseParamBrowserAuthentication
    name: "properties with oneOf alternatives by reference",
    schemas: {
      Submit: object({ action: tag("submit"), username: string }, ["action", "username"]),
      Cancel: object({ action: tag("cancel") }, ["action"]),
      Root: {
        properties: { type: tag("browser_authentication") },
        required: ["type"],
        oneOf: [ref("Submit"), ref("Cancel")],
        discriminator: { propertyName: "action" }
      }
    },
    valid: [{ type: "browser_authentication", action: "submit", username: "u" }, {
      type: "browser_authentication",
      action: "cancel"
    }],
    invalid: [{ type: "browser_authentication", action: "submit" }]
  },
  {
    // FineTuningJob
    name: "if/then/else",
    schemas: {
      Root: {
        ...object({ method: object({ type: { enum: ["supervised", "dpo"] } }), hyperparameters: { type: "object" } }),
        if: {
          properties: { method: { properties: { type: { enum: ["dpo"] } }, required: ["type"] } },
          required: ["method"]
        },
        else: { required: ["hyperparameters"] }
      }
    },
    valid: [{ method: { type: "dpo" } }, { method: { type: "supervised" }, hyperparameters: {} }],
    invalid: [{ method: 1 }]
  },
  {
    // RealtimeSessionCreateRequestGA noise_reduction
    name: "not",
    schemas: {
      Root: object({ noise_reduction: { not: { type: ["array", "string", "number", "boolean"] } } })
    },
    valid: [{ noise_reduction: null }, { noise_reduction: { type: "near_field" } }],
    invalid: [{ noise_reduction: "on" }]
  },
  {
    // FineTuningJob.method: a nullable reference narrowed by the `if` condition
    name: "nullable alternatives merged with an object constraint",
    schemas: {
      Method: object({
        type: { type: "string", enum: ["supervised", "dpo"] },
        dpo: object({ beta: { type: "number" } })
      }),
      Root: {
        ...object({ method: { anyOf: [ref("Method"), { type: "null" }] }, hyperparameters: { type: "object" } }),
        if: {
          properties: { method: { type: "object", properties: { type: { enum: ["dpo"] } }, required: ["type"] } },
          required: ["method"]
        },
        else: { required: ["hyperparameters"] }
      }
    },
    valid: [{ method: { type: "dpo", dpo: { beta: 1 } } }, { method: null, hyperparameters: {} }],
    invalid: [{ method: { type: "supervised" } }, { method: { type: "dpo", dpo: { beta: "high" } } }]
  },
  {
    // CreateRunRequest.truncation_strategy and response_format
    name: "OpenAPI 3.0 nullable markers left in a 3.1 spec",
    schemas: {
      Truncation: object({ type: tag("auto") }, ["type"]),
      Root: object({
        truncation: { allOf: [ref("Truncation"), { nullable: true }] },
        format: { ...ref("Truncation"), nullable: true }
      })
    },
    valid: [{ truncation: null, format: null }, { truncation: { type: "auto" }, format: { type: "auto" } }],
    invalid: [{ truncation: { type: "last_messages" } }, { format: "auto" }]
  },
  {
    // ImageRefParam
    name: "exactly one of two keys",
    schemas: {
      Root: {
        ...object({ image_url: string, file_id: string }),
        anyOf: [{ required: ["image_url"] }, { required: ["file_id"] }],
        not: { required: ["image_url", "file_id"] },
        additionalProperties: false
      }
    },
    valid: [{ image_url: "https://example.com/a.png" }, { file_id: "file_1" }],
    invalid: [{}, { image_url: "https://example.com/a.png", file_id: "file_1" }]
  },
  {
    // EnvironmentParamOpenaiHosted
    name: "keys that cannot be combined",
    schemas: {
      Root: {
        ...object({
          type: tag("hosted"),
          environment_id: string,
          packages: { type: "array", items: string },
          network: string
        }, [
          "type"
        ]),
        additionalProperties: false,
        not: { required: ["environment_id"], anyOf: [{ required: ["packages"] }, { required: ["network"] }] }
      }
    },
    valid: [{ type: "hosted" }, { type: "hosted", environment_id: "env_1" }, {
      type: "hosted",
      packages: ["numpy"],
      network: "none"
    }],
    invalid: [{ type: "hosted", environment_id: "env_1", packages: [] }, {
      type: "hosted",
      environment_id: "env_1",
      network: "none"
    }]
  },
  {
    // Metadata, FunctionParameters and free-form objects
    name: "maps and free-form objects",
    schemas: {
      Root: object({
        metadata: { anyOf: [{ type: "object", additionalProperties: string }, { type: "null" }] },
        parameters: { type: "object", additionalProperties: true },
        options: { type: "object" }
      })
    },
    valid: [{ metadata: { user: "u_1" }, parameters: { type: "object", properties: {} }, options: { seed: 1 } }],
    invalid: [{ metadata: { user: 1 } }, { options: "seed" }]
  },
  {
    // LocalShellToolCallOutput requires `call_id` without declaring it
    name: "required keys missing from properties",
    schemas: { Root: object({ type: tag("local_shell_call_output"), output: string }, ["type", "call_id", "output"]) },
    valid: [{ type: "local_shell_call_output", call_id: "call_1", output: "ok" }],
    invalid: [{ type: "local_shell_call_output", output: "ok" }]
  },
  {
    // A member closed by the spec forbids keys that only other members declare
    name: "explicitly closed composition members",
    schemas: {
      Root: object({
        merged: { allOf: [{ ...object({ a: string }), additionalProperties: false }, object({ b: string })] },
        distributed: {
          ...object({ a: string }),
          additionalProperties: false,
          anyOf: [object({ b: string }, ["b"]), { required: ["a"] }]
        }
      })
    },
    valid: [{ merged: { a: "a" }, distributed: { a: "a" } }],
    invalid: [{ merged: { a: "a", b: "b" } }, { distributed: { b: "b" } }]
  },
  {
    // Both alternatives keywords on one schema must hold together, whether or not the `allOf`
    // fragment declares properties of its own
    name: "anyOf and oneOf on the same object",
    schemas: {
      Root: object({
        requiredOnly: {
          ...object({ a: string, b: string, c: string }),
          allOf: [{ required: ["a"] }],
          anyOf: [{ required: ["b"] }],
          oneOf: [{ required: ["c"] }]
        },
        declaring: {
          ...object({ a: string, b: string, c: string }),
          allOf: [{ ...object({ d: string }), required: ["a"] }],
          anyOf: [{ required: ["b"] }],
          oneOf: [{ required: ["c"] }]
        }
      })
    },
    valid: [
      { requiredOnly: { a: "a", b: "b", c: "c" } },
      { declaring: { a: "a", b: "b", c: "c" } },
      { declaring: { a: "a", b: "b", c: "c", d: "d" } }
    ],
    invalid: [
      { requiredOnly: { a: "a" } },
      { requiredOnly: { a: "a", b: "b" } },
      { requiredOnly: { a: "a", c: "c" } },
      { declaring: { b: "b", c: "c" } },
      { declaring: { a: "a", b: "b" } },
      { declaring: { a: "a", c: "c" } },
      { declaring: { a: "a", b: "b", c: "c", d: 1 } }
    ]
  }
]

const openAiConfig = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const config = Schema.decodeUnknownSync(Config.CodegenConfig)(Yaml.parse(
    yield* fs.readFileString(new URL("../../../ai/openai/codegen.yaml", import.meta.url).pathname)
  ))
  // Patches addressing individual OpenAI components cannot apply to these fixtures,
  // but document-level patches (such as the OpenAPI version) still shape generation.
  const patches = config.patchList.filter((patch) => !patch.includes("\"/components/"))
  return new Config.CodegenConfig({ ...config, patches })
})

const generateAndImport = Effect.fn(function*(schemas: Record<string, unknown>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const generator = yield* Generator.CodeGenerator
  const config = yield* openAiConfig
  const root = Object.keys(schemas).at(-1)!
  const code = yield* generator.generate({
    name: "openai",
    packagePath: ".",
    outputPath: "Generated.ts",
    specSource: Config.SpecSource.File("fixture.json"),
    config
  }, {
    openapi: "3.1.0",
    info: { title: "OpenAI", version: "1.0.0" },
    paths: {
      "/root": {
        post: {
          operationId: "createRoot",
          requestBody: { required: true, content: { "application/json": { schema: ref(root) } } },
          responses: { "204": { description: "No content" } }
        }
      }
    },
    components: { schemas }
  })
  // Generated modules import `effect`, so they must live inside this package to resolve it.
  const directory = yield* fs.makeTempDirectoryScoped({ directory: import.meta.dirname })
  const file = path.join(directory, "Generated.ts")
  yield* fs.writeFileString(file, code)
  const module = yield* Effect.promise(() => import(file))
  return module[root] as Schema.Codec<unknown, unknown>
})

describe("OpenAI generation", () => {
  it.effect.each(cases)("preserves $name", ({ invalid, schemas, valid }) =>
    Effect.gen(function*() {
      const schema = yield* generateAndImport(schemas)
      const decode = Schema.decodeUnknownExit(schema)
      for (const value of valid) {
        const exit = decode(value)
        assert.isTrue(Exit.isSuccess(exit), `expected to accept ${JSON.stringify(value)}`)
        // Accepted values must decode without losing keys
        if (Exit.isSuccess(exit)) assert.deepStrictEqual(exit.value, value)
      }
      for (const value of invalid) {
        assert.isTrue(Exit.isFailure(decode(value)), `expected to reject ${JSON.stringify(value)}`)
      }
    }).pipe(
      Effect.scoped,
      Effect.provide(Generator.layerSchema.pipe(Layer.provideMerge(NodeServices.layer)))
    ))
})

describe("SpecFetcher", () => {
  it.effect("fails when a spec URL responds with an error status", () =>
    Effect.gen(function*() {
      const fetcher = yield* SpecFetcher.SpecFetcher
      const exit = yield* Effect.exit(
        fetcher.fetch(Config.SpecSource.Url("https://example.com/openapi.yml"), "openai")
      )
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(SpecFetcher.layer.pipe(
      Layer.provide(Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response("Not Found", { status: 404 })))
        )
      )),
      Layer.provide(NodeServices.layer)
    ))))

  it.effect("decompresses a gzipped spec URL", () =>
    Effect.gen(function*() {
      const fetcher = yield* SpecFetcher.SpecFetcher
      const spec = yield* fetcher.fetch(Config.SpecSource.Url("https://example.com/openapi.json.gz"), "anthropic")
      assert.deepStrictEqual(spec, { openapi: "3.1.0", paths: {} })
    }).pipe(Effect.provide(SpecFetcher.layer.pipe(
      Layer.provide(Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(
            request,
            new Response(gzipSync(JSON.stringify({ openapi: "3.1.0", paths: {} })))
          ))
        )
      )),
      Layer.provide(NodeServices.layer)
    ))))
})
