import * as Cause from "../../Cause.ts"
import * as Effect from "../../Effect.ts"
import * as Exit from "../../Exit.ts"
import * as JsonSchema from "../../JsonSchema.ts"
import * as Scheduler from "../../Scheduler.ts"
import type * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaIssue from "../../SchemaIssue.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "../../StandardSchema.ts"
import * as InternalToCodec from "./toCodec.ts"
import * as InternalToJsonSchemaDocument from "./toJsonSchemaDocument.ts"
import * as InternalToRepresentation from "./toRepresentation.ts"

function makeStandardResult<A>(exit: Exit.Exit<StandardSchemaV1.Result<A>>): StandardSchemaV1.Result<A> {
  return Exit.isSuccess(exit) ? exit.value : {
    issues: [{ message: Cause.pretty(exit.cause) }]
  }
}

/** @internal */
export function toStandardSchemaV1<S extends Schema.ConstraintDecoder<unknown>>(
  self: S,
  options?: {
    readonly leafHook?: SchemaIssue.LeafHook | undefined
    readonly checkHook?: SchemaIssue.CheckHook | undefined
    readonly parseOptions?: SchemaAST.ParseOptions | undefined
  }
): StandardSchemaV1<S["Encoded"], S["Type"]> & S {
  const decodeUnknownEffect = SchemaParser.decodeUnknownEffect(self) as (
    input: unknown,
    options?: SchemaAST.ParseOptions
  ) => Effect.Effect<S["Type"], SchemaIssue.Issue>
  const parseOptions: SchemaAST.ParseOptions = { errors: "all", ...options?.parseOptions }
  const formatter = SchemaIssue.makeFormatterStandardSchemaV1(options)
  const validate: StandardSchemaV1<S["Encoded"], S["Type"]>["~standard"]["validate"] = (value: unknown) => {
    const scheduler = new Scheduler.MixedScheduler("sync")
    const fiber = Effect.runFork(
      Effect.match(decodeUnknownEffect(value, parseOptions), {
        onFailure: formatter,
        onSuccess: (value): StandardSchemaV1.Result<S["Type"]> => ({ value })
      }),
      { scheduler }
    )
    fiber.currentDispatcher?.flush()
    const exit = fiber.pollUnsafe()
    if (exit) {
      return makeStandardResult(exit)
    }
    return new Promise((resolve) => {
      fiber.addObserver((exit) => {
        resolve(makeStandardResult(exit))
      })
    })
  }
  if ("~standard" in self) {
    const out = self as any
    if ("validate" in out["~standard"]) return out
    Object.assign(out["~standard"], { validate })
    return out
  }
  return Object.assign(self, {
    "~standard": {
      version: 1,
      vendor: "effect",
      validate
    } as const
  })
}

function toJsonSchemaDocument(ast: SchemaAST.AST): JsonSchema.Document<"draft-2020-12"> {
  const document = InternalToRepresentation.toRepresentation(
    InternalToCodec.toCodecJsonAST(ast)
  )
  return InternalToJsonSchemaDocument.toJsonSchemaDocument(document)
}

function toBaseStandardJSONSchemaV1(
  ast: SchemaAST.AST,
  target: StandardJSONSchemaV1.Target
): JsonSchema.JsonSchema {
  const doc2020_12 = toJsonSchemaDocument(ast)
  if (target === "draft-2020-12") {
    const schema = doc2020_12.schema
    if (Object.keys(doc2020_12.definitions).length > 0) {
      schema.$defs = doc2020_12.definitions
    }
    return schema
  } else if (target === "draft-07") {
    const doc07 = JsonSchema.toDocumentDraft07(doc2020_12)
    const schema = doc07.schema
    if (Object.keys(doc07.definitions).length > 0) {
      schema.definitions = doc07.definitions
    }
    return schema
  }
  throw new globalThis.Error(`Unsupported target: ${target}`)
}

/** @internal */
export function toStandardJSONSchemaV1<S extends Schema.Constraint>(
  self: S
): StandardJSONSchemaV1<S["Encoded"], S["Type"]> & S {
  const jsonSchema: StandardJSONSchemaV1.Props<S["Encoded"], S["Type"]>["jsonSchema"] = {
    input(options) {
      return toBaseStandardJSONSchemaV1(self.ast, options.target)
    },
    output(options) {
      return toBaseStandardJSONSchemaV1(SchemaAST.toType(self.ast), options.target)
    }
  }
  if ("~standard" in self) {
    const out = self as any
    if ("jsonSchema" in out["~standard"]) return out
    Object.assign(out["~standard"], { jsonSchema })
    return out
  }
  return Object.assign(self, {
    "~standard": {
      version: 1,
      vendor: "effect",
      jsonSchema
    } as const
  })
}
