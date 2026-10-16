import type { Effect, FileSystem, Path, PlatformError } from "effect"
import * as SchemaAOTCompilerBuild from "effect/schema/SchemaAOTCompiler/Build"
import { describe, expect, it } from "tstyche"

describe("SchemaAOTCompilerBuild", () => {
  it("build", () => {
    const modules: Record<string, () => Promise<unknown>> = {
      "./schema.js": () => Promise.resolve({})
    }
    const result = SchemaAOTCompilerBuild.build({
      modules,
      baseUrl: import.meta.url,
      outFile: "./schema-aot.js"
    })

    expect(result).type.toBe<
      Effect.Effect<
        SchemaAOTCompilerBuild.BuildResult,
        SchemaAOTCompilerBuild.BuildError | PlatformError.PlatformError,
        FileSystem.FileSystem | Path.Path
      >
    >()
    expect(SchemaAOTCompilerBuild.build).type.not.toBeCallableWith({
      modules: {},
      outFile: "./schema-aot.js"
    })
    expect(SchemaAOTCompilerBuild.build).type.not.toBeCallableWith({
      modules: {},
      baseUrl: import.meta.url,
      outFile: "./schema-aot.js",
      operations: ["parse"]
    })
  })
})
