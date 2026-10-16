import { memoize } from "../../Function.ts"
import type * as Schema from "../../Schema.ts"
import type * as SchemaAST from "../../SchemaAST.ts"

/** @internal */
export function resolve(ast: SchemaAST.AST): Schema.Annotations.Annotations | undefined {
  return ast.checks ? ast.checks[ast.checks.length - 1].annotations : ast.annotations
}

/** @internal */
export function resolveAt<A>(key: string) {
  return (ast: SchemaAST.AST): A | undefined => resolve(ast)?.[key] as A | undefined
}

/** @internal */
export const STRUCTURAL_ANNOTATION_KEY = "~structural"

/** @internal */
export const IDENTIFIER_FALLBACK_KEY = "~identifier"

/** @internal */
export const SENTINELS_ANNOTATION_KEY = "~sentinels"

/** @internal */
export const CONSTRUCTOR_ANNOTATION_KEY = "~constructor"

/** @internal */
export const jsonSchemaAnnotationKeys = [
  "title",
  "description",
  "default",
  "examples",
  "readOnly",
  "writeOnly",
  "format",
  "contentEncoding",
  "contentMediaType",
  "contentSchema"
] as const

/** @internal */
export const resolveIdentifier = resolveAt<string>("identifier")

/** @internal */
export const resolveIdentifierFallback = resolveAt<string>(IDENTIFIER_FALLBACK_KEY)

/** @internal */
export const resolveTitle = resolveAt<string>("title")

/** @internal */
export const resolveDescription = resolveAt<string>("description")

/** @internal */
export const getExpected = memoize((ast: SchemaAST.AST): string => {
  const identifier = resolve(ast)?.identifier
  if (typeof identifier === "string") return identifier
  return ast.getExpected(getExpected)
})

/** @internal */
export const annotationExcludedKeys = new Set([
  SENTINELS_ANNOTATION_KEY,
  STRUCTURAL_ANNOTATION_KEY,
  "representation",
  "arbitraryConstraint",
  "toJsonSchema",
  "toCode",
  "toEquivalence",
  "toFormatter",
  "toCodec",
  "toCodecJson",
  "toCodecStringTree",
  "toCodecIso",
  "toCodecArbitrary"
])
