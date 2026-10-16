import * as Config from "@effect/ai-codegen/Config"
import type { DiscoveredProvider } from "@effect/ai-codegen/Discovery"
import * as Generator from "@effect/ai-codegen/Generator"
import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"

const TestLayer = Generator.layer.pipe(
  Layer.provide(Layer.succeed(OpenApiGenerator.OpenApiGenerator, {
    generate: (spec) => Effect.succeed(JSON.stringify(spec))
  })),
  Layer.provideMerge(NodeServices.layer)
)

const provider = (patch: string): DiscoveredProvider => ({
  name: "test",
  packagePath: "/providers/test",
  config: new Config.CodegenConfig({
    spec: "spec.json",
    output: "Generated.ts",
    patches: [patch]
  }),
  specSource: Config.SpecSource.File("spec.json"),
  outputPath: "Generated.ts"
})

const generateWithPatch = (patch: string) =>
  Effect.gen(function*() {
    const generator = yield* Generator.CodeGenerator
    const output = yield* generator.generate(provider(patch), {
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
