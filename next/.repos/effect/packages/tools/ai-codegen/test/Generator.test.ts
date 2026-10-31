import * as Config from "@effect/ai-codegen/Config"
import type { DiscoveredProvider } from "@effect/ai-codegen/Discovery"
import * as Generator from "@effect/ai-codegen/Generator"
import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as TestConsole from "effect/testing/TestConsole"

const TestLayer = Generator.layer.pipe(
  Layer.provide(Layer.succeed(OpenApiGenerator.OpenApiGenerator, {
    generate: (spec) => Effect.succeed(JSON.stringify(spec))
  })),
  Layer.provideMerge(NodeServices.layer)
)

const provider = (
  fields: Omit<ConstructorParameters<typeof Config.CodegenConfig>[0], "spec" | "output">
): DiscoveredProvider => ({
  name: "test",
  packagePath: "/providers/test",
  config: new Config.CodegenConfig({ spec: "spec.json", output: "Generated.ts", ...fields }),
  specSource: Config.SpecSource.File("spec.json"),
  outputPath: "Generated.ts"
})

const generateWithPatch = Effect.fnUntraced(function*(patch: string) {
  const generator = yield* Generator.CodeGenerator
  const output = yield* generator.generate(provider({ patches: [patch] }), {
    openapi: "3.1.0",
    info: { title: "Before", version: "1.0.0" },
    paths: {}
  })
  return JSON.parse(output)
})

describe("CodeGenerator patch inputs", () => {
  it.effect("accepts inline patches with leading whitespace", () =>
    Effect.gen(function*() {
      const result = yield* generateWithPatch(
        " \n[{\"op\":\"replace\",\"path\":\"/info/title\",\"value\":\"After\"}]"
      )
      assert.deepStrictEqual(result, {
        openapi: "3.1.0",
        info: { title: "After", version: "1.0.0" },
        paths: {}
      })
    }).pipe(Effect.provide(TestLayer)))

  it.effect("accepts absolute paths with leading whitespace", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path
      const patch = path.join(
        import.meta.dirname,
        "../../openapi-generator/test/fixtures/patches/valid-replace.json"
      )
      const result = yield* generateWithPatch(` ${patch}`)
      assert.deepStrictEqual(result, {
        openapi: "3.1.0",
        info: { title: "Updated API Title", version: "1.0.0" },
        paths: {}
      })
    }).pipe(Effect.provide(TestLayer)))
})

describe("CodeGenerator warnings", () => {
  it.effect("reports OpenAPI generator warnings to stderr without changing the generated code", () =>
    Effect.gen(function*() {
      const generator = yield* Generator.CodeGenerator
      const output = yield* generator.generate(provider({ patches: ["[]"] }), {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {}
      })
      assert.strictEqual(output, "export const Generated = 1")
      assert.deepStrictEqual(yield* TestConsole.errorLines, [
        "WARNING [cookie-parameter-dropped] GET /items (listItems): Cookie parameter \"session\" was dropped."
      ])
    }).pipe(Effect.provide(
      Generator.layer.pipe(
        Layer.provide(Layer.succeed(OpenApiGenerator.OpenApiGenerator, {
          generate: (_spec, options) => {
            options.onWarning?.({
              code: "cookie-parameter-dropped",
              message: "Cookie parameter \"session\" was dropped.",
              path: "/items",
              method: "get",
              operationId: "listItems"
            })
            return Effect.succeed("export const Generated = 1")
          }
        })),
        Layer.provideMerge(Layer.mergeAll(NodeServices.layer, TestConsole.layer))
      )
    )))
})

describe("CodeGenerator includePaths", () => {
  it.effect("keeps paths matching a prefix after applying patches", () =>
    Effect.gen(function*() {
      const generator = yield* Generator.CodeGenerator
      // The patch targets an excluded path, so it only applies if filtering runs afterwards
      const patch = "[{\"op\":\"replace\",\"path\":\"/paths/~1v1~1models/get\",\"value\":{}}]"
      const output = yield* generator.generate(provider({ patches: [patch], includePaths: ["/v1/messages"] }), {
        openapi: "3.1.0",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/v1/messages?beta=true": { post: {} },
          "/v1/messages/batches/{id}": { get: {} },
          "/v1/models": { get: { operationId: "models" } }
        }
      })
      assert.deepStrictEqual(JSON.parse(output).paths, {
        "/v1/messages?beta=true": { post: {} },
        "/v1/messages/batches/{id}": { get: {} }
      })
    }).pipe(Effect.provide(TestLayer)))
})

describe("CodeGenerator collapseErrorResponses", () => {
  it.effect("replaces explicit error responses with one 4XX response using the shared envelope", () =>
    Effect.gen(function*() {
      const generator = yield* Generator.CodeGenerator
      const envelope = { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      const output = yield* generator.generate(provider({ collapseErrorResponses: true }), {
        openapi: "3.1.0",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/v1/messages": {
            post: {
              responses: {
                "200": { description: "OK" },
                // Statuses narrowed inline, as in the Anthropic spec, must not leak into the result
                "429": {
                  description: "Rate limited",
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: { error: { type: "object" } } }
                    }
                  }
                },
                "401": { description: "Unauthorized", content: envelope },
                "500": { description: "Internal error", content: envelope }
              }
            }
          }
        }
      })
      const { responses } = JSON.parse(output).paths["/v1/messages"].post
      assert.deepStrictEqual(Object.keys(responses), ["200", "4XX"])
      assert.deepStrictEqual(responses["4XX"].content, envelope)
    }).pipe(Effect.provide(TestLayer)))
})
