import { Schema, SchemaAST } from "effect"
import * as SchemaAOTCompiler from "effect/schema/SchemaAOTCompiler"
import { describe, expect, it } from "tstyche"

describe("SchemaAOTCompiler", () => {
  it("compiles ASTs to module source", () => {
    expect(SchemaAOTCompiler.compile([{ ast: Schema.String.ast, operations: ["decode"] }])).type.toBe<string>()
    expect(SchemaAOTCompiler.compile).type.toBeCallableWith(
      [
        { ast: SchemaAST.string, operations: ["decode"] },
        { ast: SchemaAST.number, operations: ["is", "make"] }
      ] as const
    )
    expect(SchemaAOTCompiler.compile).type.toBeCallableWith([])
    expect(SchemaAOTCompiler.compile).type.not.toBeCallableWith(SchemaAST.string)
    expect(SchemaAOTCompiler.compile).type.not.toBeCallableWith(Schema.String)
    expect(SchemaAOTCompiler.compile).type.not.toBeCallableWith([SchemaAST.string])
    expect(SchemaAOTCompiler.compile).type.not.toBeCallableWith(
      [
        { ast: SchemaAST.string, operations: ["encode"] }
      ] as const
    )
  })
})
