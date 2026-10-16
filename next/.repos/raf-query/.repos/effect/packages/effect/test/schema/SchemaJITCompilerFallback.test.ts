import { assert, describe, it, vi } from "@effect/vitest"
import { Cause, Schema, SchemaParser, SchemaTransformation } from "effect"
import * as Codegen from "effect/internal/schema/codegen"
// oxlint-disable-next-line no-unassigned-import
import "effect/schema/SchemaJITCompiler/enable"
import { assertSchemaIssueError, deepStrictEqual, strictEqual, throws } from "../utils/assert.ts"

describe("Schema JIT compilation fallback", () => {
  for (const phase of ["construction", "factory"] as const) {
    for (const firstOperation of ["decode", "is"] as const) {
      it(`recovers ${phase} failure during ${firstOperation} without retrying`, () => {
        const schema = Schema.Struct({ value: Schema.String })
        const getParser = vi.spyOn(schema.ast, "getParser")
        const Function = globalThis.Function
        let attempts = 0
        try {
          globalThis.Function = ((...args: Array<string>) => {
            if (args.length === 1 && args[0] === "return true") return Function(...args)
            attempts++
            if (phase === "construction") throw new SyntaxError("invalid generated source")
            return () => {
              throw new Error("generated factory failed")
            }
          }) as FunctionConstructor

          const decode = SchemaParser.decodeUnknownSync(schema)
          const is = SchemaParser.is(schema)
          const input = { value: "valid", extra: true }
          if (firstOperation === "is") strictEqual(is(input), true)
          deepStrictEqual(decode(input), { value: "valid" })
          strictEqual(is(input), true)
          strictEqual(is({ value: 1 }), false)
          throws(() => decode({ value: 1 }), (error) => {
            assertSchemaIssueError(error, `Expected string\n  at ["value"]`)
          })
          throws(() => decode(input, { onExcessProperty: "error" }), (error) => {
            assertSchemaIssueError(error, `Expected no excess property\n  at ["extra"]`)
          })
          deepStrictEqual(SchemaParser.decodeUnknownSync(schema)(input), { value: "valid" })
          strictEqual(attempts, 1)
          strictEqual(getParser.mock.calls.length, 1)
        } finally {
          globalThis.Function = Function
          getParser.mockRestore()
        }
      })
    }
  }

  for (const phase of ["generate"] as const) {
    it(`recovers errors in ${phase} without disabling other schemas`, () => {
      const failure = vi.spyOn(Codegen, phase).mockImplementationOnce(() => {
        throw new Error("compiler failed")
      })
      const schema = Schema.Struct({ value: Schema.String })
      const getParser = vi.spyOn(schema.ast, "getParser")
      try {
        const decode = SchemaParser.decodeUnknownSync(schema)
        deepStrictEqual(decode({ value: "valid" }), { value: "valid" })
        strictEqual(getParser.mock.calls.length, 1)
        const attempts = failure.mock.calls.length
        deepStrictEqual(decode({ value: "again" }), { value: "again" })
        strictEqual(failure.mock.calls.length, attempts)

        const other = Schema.Struct({ value: Schema.String })
        const otherParser = vi.spyOn(other.ast, "getParser")
        try {
          deepStrictEqual(SchemaParser.decodeUnknownSync(other)({ value: "compiled" }), { value: "compiled" })
          strictEqual(otherParser.mock.calls.length, 0)
        } finally {
          otherParser.mockRestore()
        }
      } finally {
        failure.mockRestore()
        getParser.mockRestore()
      }
    })
  }

  it("recovers composed decoder generation without repeating transformations", () => {
    let transformations = 0
    const field = Schema.String.pipe(Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({
        decode: (value) => {
          transformations++
          return value.trim()
        },
        encode: (value) => value
      })
    ))
    const schema = Schema.Struct({ value: field })
    const generate = Codegen.generate
    const failure = vi.spyOn(Codegen, "generate").mockImplementation((ast, operation) => {
      if (ast === schema.ast) throw new Error("composed decoder generation failed")
      return generate(ast, operation)
    })
    try {
      const decode = SchemaParser.decodeUnknownSync(schema)
      deepStrictEqual(decode({ value: " a " }), { value: "a" })
      deepStrictEqual(decode({ value: " b " }), { value: "b" })
      strictEqual(transformations, 2)
      strictEqual(failure.mock.calls.filter(([ast]) => ast === schema.ast).length, 1)
    } finally {
      failure.mockRestore()
    }
  })

  it("recovers decoder generation without replaying its encoding or middleware", () => {
    let transformations = 0
    let middlewareRuns = 0
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.Struct({ value: Schema.String.check(Schema.isMinLength(2)) }),
        SchemaTransformation.transform({
          decode: (value) => {
            transformations++
            return { value: value.trim() }
          },
          encode: (value) => value.value
        })
      ),
      Schema.middlewareDecoding((effect) => {
        middlewareRuns++
        return effect
      })
    )
    const emit = Codegen.generate
    let attempts = 0
    let transformationsAtFailure = 0
    const failure = vi.spyOn(Codegen, "generate").mockImplementation((ast, operation) => {
      if (ast === schema.ast) {
        attempts++
        transformationsAtFailure = transformations
        throw new Error("local checkpoint generation failed")
      }
      return emit(ast, operation)
    })
    try {
      const decode = SchemaParser.decodeUnknownSync(schema)
      deepStrictEqual(decode(" valid "), { value: "valid" })
      strictEqual(transformationsAtFailure, 0)
      strictEqual(transformations, 1)
      strictEqual(middlewareRuns, 1)
      throws(() => decode(" x "))
      strictEqual(transformations, 2)
      strictEqual(middlewareRuns, 2)
      strictEqual(attempts, 1)
    } finally {
      failure.mockRestore()
    }
  })

  it("propagates errors from executing generated code without interpreting the input", () => {
    const schema = Schema.Struct({ value: Schema.String })
    const getParser = vi.spyOn(schema.ast, "getParser")
    const Function = globalThis.Function
    let executions = 0
    const defect = new Error("generated parser failed")
    try {
      globalThis.Function = ((...args: Array<string>) => {
        if (args.length === 1 && args[0] === "return true") return Function(...args)
        return () => () => {
          executions++
          throw defect
        }
      }) as FunctionConstructor
      const result = SchemaParser.decodeUnknownExit(schema)({ value: "valid" })
      assert(result._tag === "Failure")
      assert(Cause.hasDies(result.cause))
      strictEqual(executions, 1)
      strictEqual(getParser.mock.calls.length, 0)
    } finally {
      globalThis.Function = Function
      getParser.mockRestore()
    }
  })
})
