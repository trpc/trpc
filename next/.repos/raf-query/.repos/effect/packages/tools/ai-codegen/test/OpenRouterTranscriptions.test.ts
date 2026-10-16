import * as Config from "@effect/ai-codegen/Config"
import * as Generator from "@effect/ai-codegen/Generator"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

const operation = (operationId: string) => ({
  operationId,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: { type: "object", properties: { input_audio: { type: "string" } }, required: ["input_audio"] }
      },
      "multipart/form-data": {
        schema: { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] }
      }
    }
  },
  responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "string" } } } } }
})

describe("OpenRouter transcription spec patch", () => {
  it.effect("selects JSON only for transcriptions while preserving multipart elsewhere", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const generator = yield* Generator.CodeGenerator
      const config = Schema.decodeUnknownSync(Config.CodegenConfig)(Yaml.parse(
        yield* fs.readFileString(new URL("../../../ai/openrouter/codegen.yml", import.meta.url).pathname)
      ))
      const patches = config.patchList.filter((patch) => patch.includes("/paths/~1audio~1transcriptions/"))
      assert.strictEqual(patches.length, 1)
      const generate = (patches: ReadonlyArray<string>) =>
        generator.generate({
          name: "openrouter",
          packagePath: ".",
          outputPath: "Generated.ts",
          specSource: Config.SpecSource.File("fixture.json"),
          config: new Config.CodegenConfig({ ...config, patches })
        }, {
          openapi: "3.1.0",
          info: { title: "Transcriptions", version: "1.0.0" },
          paths: {
            "/audio/transcriptions": { post: operation("createAudioTranscriptions") },
            "/uploads": { post: operation("upload") }
          }
        })
      const before = yield* generate([])
      const after = yield* generate(patches)
      assert.include(before, "CreateAudioTranscriptionsRequestFormData.Encoded")
      assert.notInclude(after, "CreateAudioTranscriptionsRequestFormData")
      assert.include(after, "CreateAudioTranscriptionsRequestJson.Encoded")
      assert.include(after, "UploadRequestFormData.Encoded")
      assert.strictEqual(before.match(/HttpClientRequest.bodyFormDataRecord/g)?.length, 2)
      assert.strictEqual(after.match(/HttpClientRequest.bodyFormDataRecord/g)?.length, 1)
      assert.strictEqual(after.match(/HttpClientRequest.bodyJsonUnsafe/g)?.length, 1)
    }).pipe(Effect.provide(Generator.layerSchema.pipe(Layer.provideMerge(NodeServices.layer)))))
})
