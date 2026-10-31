import { identity, memoize, memoizeIdempotent } from "../../Function.ts"
import * as Option from "../../Option.ts"
import * as Predicate from "../../Predicate.ts"
import type * as PublicSchema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaGetter from "../../SchemaGetter.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalTransformation from "../../SchemaTransformation.ts"
import * as InternalMake from "./make.ts"

/** @internal */
export function toCodecJson<S extends PublicSchema.Constraint>(schema: S): PublicSchema.toCodecJson<S> {
  return InternalMake.make(toCodecJsonAST(schema.ast), { schema })
}

/** @internal */
export const toCodecJsonAST = makeCodecDerivation(toCodecJsonASTStep)

function makeCodecDerivation(
  step: (ast: SchemaAST.AST, recur: (ast: SchemaAST.AST) => SchemaAST.AST) => SchemaAST.AST,
  options?: { readonly stopAt?: (link: SchemaAST.Link) => boolean }
): (ast: SchemaAST.AST) => SchemaAST.AST {
  // Derive each body once, independently of its own context. Child contexts remain part of the body.
  const deriveBody = memoize((owner: SchemaAST.AST) => {
    const body = SchemaAST.replaceContext(owner, undefined)
    const out = step(body, recur)
    return out === body ? null : out
  })
  // Follow existing encodings before sharing bodies: their encoded forms may differ.
  const recur = SchemaAST.applyToSelfOrLastLinkEncodingIdempotent((ast) => {
    const derived = deriveBody(SchemaAST.getContextOwner(ast))
    if (derived === null) return ast
    const out = SchemaAST.replaceContext(derived, ast.context)
    return ast.context === undefined ?
      out :
      SchemaAST.replaceContextLastLink(out, withoutConstructorDefault(ast.context))
  }, options)
  return recur
}

function withoutConstructorDefault(context: SchemaAST.Context): SchemaAST.Context {
  return context.constructorDefault === undefined ?
    context :
    new SchemaAST.Context(context.isOptional, context.isMutable, undefined, context.annotations)
}

function validateCanonicalObjectPropertyNames(ast: SchemaAST.Objects): void {
  if (ast.propertySignatures.some((ps) => typeof ps.name !== "string")) {
    throw new globalThis.Error("Objects property names must be strings", { cause: ast })
  }
}

function makeReorder(getPriority: (ast: SchemaAST.AST) => number) {
  return (types: ReadonlyArray<SchemaAST.AST>): ReadonlyArray<SchemaAST.AST> => {
    const sortedTypes = [...types].sort((a, b) =>
      getPriority(SchemaAST.toEncoded(a)) - getPriority(SchemaAST.toEncoded(b))
    )

    // Check if order changed by comparing arrays
    const orderChanged = sortedTypes.some((ast, index) => ast !== types[index])

    if (!orderChanged) return types
    return sortedTypes
  }
}

const toCodecJsonReorder = makeReorder((ast: SchemaAST.AST) => {
  switch (ast._tag) {
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0
    default:
      return 1
  }
})

function toCodecJsonASTStep(ast: SchemaAST.AST, recur: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST {
  switch (ast._tag) {
    case "Declaration": {
      const getLink = ast.annotations?.toCodecJson ?? ast.annotations?.toCodec
      if (!Predicate.isFunction(getLink)) {
        return SchemaAST.replaceEncoding(ast, [SchemaAST.unknownToJson])
      }
      const typeParameters = ast.typeParameters.map((tp) => InternalMake.make(SchemaAST.toEncoded(tp)))
      const link = getLink(typeParameters)
      return link === undefined ? ast : SchemaAST.replaceEncoding(ast, [SchemaAST.mapLink(link, recur)])
    }
    case "Unknown":
      return SchemaAST.replaceEncoding(ast, [SchemaAST.unknownToJson])
    case "ObjectKeyword":
      return SchemaAST.replaceEncoding(ast, [SchemaAST.objectKeywordToJson])
    case "Undefined":
    case "Void":
    case "Literal":
    case "Number":
      return ast.toCodecJson()
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree()
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast)
      return ast.recur(recur, SchemaAST.parameterFromString)
    }
    case "Union": {
      const sortedTypes = toCodecJsonReorder(ast.types)
      if (sortedTypes !== ast.types) {
        return new SchemaAST.Union(
          sortedTypes,
          ast.options,
          ast.annotations,
          ast.checks,
          ast.encoding,
          ast.context,
          ast.encodingChecks
        ).recur(recur)
      }
      return ast.recur(recur)
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur)
  }
  // `Schema.Any` is used as an escape hatch
  return ast
}

/** @internal */
export function toCodecIso<S extends PublicSchema.Constraint>(
  schema: S
): PublicSchema.Codec<S["Type"], S["Iso"]> {
  return InternalMake.make(toCodecIsoAST(SchemaAST.toType(schema.ast)))
}

const toCodecIsoAST = memoize((ast: SchemaAST.AST): SchemaAST.AST => {
  const out = toCodecIsoASTStep(ast, toCodecIsoAST)
  return out !== ast && ast.context !== undefined ?
    SchemaAST.replaceContextLastLink(out, withoutConstructorDefault(ast.context)) :
    out
})

function toCodecIsoASTStep(ast: SchemaAST.AST, recur: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST {
  switch (ast._tag) {
    case "Declaration": {
      const getLink = ast.annotations?.toCodecIso ?? ast.annotations?.toCodec
      if (Predicate.isFunction(getLink)) {
        const link = getLink(ast.typeParameters.map((tp) => InternalMake.make(tp)))
        return SchemaAST.replaceEncoding(ast, [SchemaAST.mapLink(link, recur)])
      }
      return ast
    }
    case "Arrays":
    case "Objects":
    case "Union":
    case "Suspend":
      return ast.recur(recur)
  }
  return ast
}

/** @internal */
export function toCodecStringTree<S extends PublicSchema.Constraint>(
  schema: S
): PublicSchema.toCodecStringTree<S> {
  return InternalMake.make(toCodecStringTreeAST(schema.ast), { schema })
}

/** @internal */
export function toCodecArrayFromSingle<S extends PublicSchema.Constraint>(
  schema: S
): PublicSchema.toCodecArrayFromSingle<S> {
  return InternalMake.make(toCodecArrayFromSingleAST(schema.ast))
}

const toStringTreeReorder = makeReorder((ast: SchemaAST.AST) => {
  switch (ast._tag) {
    case "Null":
    case "Boolean":
    case "Number":
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0
    default:
      return 1
  }
})

function toCodecStringTreeASTStep(
  ast: SchemaAST.AST,
  recur: (ast: SchemaAST.AST) => SchemaAST.AST,
  onMissingAnnotation: (ast: SchemaAST.AST) => SchemaAST.AST
): SchemaAST.AST {
  switch (ast._tag) {
    case "Declaration": {
      const typeParameters = ast.typeParameters.map((tp) => InternalMake.make(recur(SchemaAST.toEncoded(tp))))
      const getStringTreeLink = ast.annotations?.toCodecStringTree
      if (Predicate.isFunction(getStringTreeLink)) {
        const link = getStringTreeLink(typeParameters)
        if (link === undefined) return ast
        return SchemaAST.replaceEncoding(ast, [SchemaAST.mapLink(link, recur)])
      }
      const getJsonLink = ast.annotations?.toCodecJson
      const jsonLink = Predicate.isFunction(getJsonLink) ? getJsonLink(typeParameters) : undefined
      const getLink = jsonLink === undefined ? ast.annotations?.toCodec : undefined
      const link = jsonLink ?? (Predicate.isFunction(getLink) ? getLink(typeParameters) : undefined)
      return link === undefined
        ? onMissingAnnotation(ast)
        : SchemaAST.replaceEncoding(ast, [SchemaAST.mapLink(link, recur)])
    }
    case "Null":
      return SchemaAST.replaceEncoding(ast, [nullToString])
    case "Boolean":
      return SchemaAST.replaceEncoding(ast, [booleanToString])
    case "Unknown":
    case "ObjectKeyword":
      return SchemaAST.replaceEncoding(ast, [SchemaAST.unknownToStringTree])
    case "Enum":
    case "Number":
    case "Literal":
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree()
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast)
      return ast.recur(recur, SchemaAST.parameterFromString)
    }
    case "Union": {
      const sortedTypes = toStringTreeReorder(ast.types)
      if (sortedTypes !== ast.types) {
        return new SchemaAST.Union(
          sortedTypes,
          ast.options,
          ast.annotations,
          ast.checks,
          ast.encoding,
          ast.context,
          ast.encodingChecks
        ).recur(recur)
      }
      return ast.recur(recur)
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur)
  }
  // `Schema.Any` is used as an escape hatch
  return ast
}

const nullToString = new SchemaAST.Link(
  new SchemaAST.Literal("null"),
  new InternalTransformation.Transformation(
    SchemaGetter.transform(() => null),
    SchemaGetter.transform(() => "null")
  )
)

const booleanToString = new SchemaAST.Link(
  new SchemaAST.Union([new SchemaAST.Literal("true"), new SchemaAST.Literal("false")]),
  new InternalTransformation.Transformation(
    SchemaGetter.transform((s) => s === "true"),
    SchemaGetter.String()
  )
)

const arrayFromSingleTransformation = new InternalTransformation.Transformation(
  SchemaGetter.transform((input: ReadonlyArray<unknown> | string) => typeof input === "string" ? [input] : input),
  SchemaGetter.passthrough()
)

const isCodecArrayFromSingleLink = (link: SchemaAST.Link): boolean =>
  link.transformation === arrayFromSingleTransformation

const toCodecStringTreeAST = makeCodecDerivation((ast, recur) =>
  toCodecStringTreeASTStep(ast, recur, (ast) => {
    throw new globalThis.Error("Missing structural codec for StringTree", { cause: ast })
  }), { stopAt: isCodecArrayFromSingleLink })

const toArrayFromSingleInputElement = (ast: SchemaAST.AST): SchemaAST.AST =>
  SchemaAST.isOptional(ast) ? SchemaAST.optionalKey(SchemaAST.unknown) : SchemaAST.unknown

const toCodecArrayFromSingleAST = SchemaAST.applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  const out = toCodecArrayFromSingleASTStep(ast)
  if (SchemaAST.isArrays(out)) {
    const ensure = SchemaAST.decodeTo(
      new SchemaAST.Union(
        [
          new SchemaAST.Arrays(
            out.isMutable,
            out.elements.map(toArrayFromSingleInputElement),
            out.rest.map(toArrayFromSingleInputElement)
          ),
          SchemaAST.string
        ],
        { mode: "anyOf" }
      ),
      out,
      arrayFromSingleTransformation
    )
    return SchemaAST.isOptional(ast) ? SchemaAST.optionalKey(ensure) : ensure
  }
  return out
}, { stopAt: isCodecArrayFromSingleLink })

/** @internal */
export function toCodecGoJson<S extends PublicSchema.Constraint>(
  schema: S
): PublicSchema.toCodecGoJson<S> {
  return InternalMake.make(toCodecGoJsonAST(schema.ast), { schema })
}

// Keep the canonical member first to preserve accepted nulls and union branch
// selection. Added members (`never`, `[]`, `{}`) do not widen the decoded type.
const toCodecGoJsonAST = memoizeIdempotent((ast: SchemaAST.AST): SchemaAST.AST =>
  nilAsEmptyAtEncoded(goNilAST(toCodecJsonAST(ast)))
)

const goNilAST: (ast: SchemaAST.AST) => SchemaAST.AST = SchemaAST.applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    case "Objects":
      return ast.recur((type) => nilAsMissingOrEmptyAtEncoded(goNilAST(type)), identity)
    case "Arrays":
      return ast.recur((type) => nilAsEmptyAtEncoded(goNilAST(type)))
    case "Declaration":
    case "Union":
    case "Suspend":
      return ast.recur(goNilAST)
  }
  return ast
})

const nilAsMissingOrEmptyAtEncoded = SchemaAST.applyToSelfOrLastLinkEncoding((ast) =>
  SchemaAST.isOptional(ast) ? nilAsMissingAtEncoded(ast) : nilAsEmptyAtEncoded(ast)
)

const nilAsMissingAtEncoded: (ast: SchemaAST.AST) => SchemaAST.AST = SchemaAST.applyToSelfOrLastLinkEncoding(
  (ast) => {
    if (SchemaAST.isSuspend(ast)) return ast.recur(nilAsMissingAtEncoded)
    if (isGoNil(ast) || acceptsNull(ast)) return ast
    return orNull(ast, decodeNull(SchemaAST.never, nullAsMissing))
  }
)

// Only a plain `Schema.Array` or `Schema.Record` can be a Go slice or map, so
// tuples, non-empty arrays, and structs keep rejecting `null`. The empty value
// still has to pass the collection's checks.
const nilAsEmptyAtEncoded: (ast: SchemaAST.AST) => SchemaAST.AST = SchemaAST.applyToSelfOrLastLinkEncoding((ast) => {
  if (SchemaAST.isSuspend(ast)) return ast.recur(nilAsEmptyAtEncoded)
  if (SchemaAST.isArrays(ast) && ast.elements.length === 0 && ast.rest.length === 1) {
    return orNull(ast, decodeNull(SchemaAST.replaceChecks(emptyArray, ast.checks), nullAsEmptyArray))
  }
  if (SchemaAST.isObjects(ast) && ast.propertySignatures.length === 0 && ast.indexSignatures.length > 0) {
    return orNull(ast, decodeNull(SchemaAST.replaceChecks(emptyRecord, ast.checks), nullAsEmptyRecord))
  }
  return ast
})

// Only skips the `null` member when the schema certainly accepts `null`, to
// keep the JSON Schema tidy. Suspended schemas are not resolved, so recursive
// definitions stay lazy.
function acceptsNull(ast: SchemaAST.AST): boolean {
  const encoded = SchemaAST.getLastEncoding(ast)
  switch (encoded._tag) {
    case "Union":
      return encoded.checks === undefined && encoded.types.some(acceptsNull)
    case "Null":
    case "Unknown":
    case "Any":
    case "Declaration":
      return SchemaParser.is(InternalMake.make(SchemaAST.replaceContext(encoded, undefined)))(null)
  }
  return false
}

function orNull(ast: SchemaAST.AST, member: SchemaAST.AST): SchemaAST.AST {
  return SchemaAST.replaceContext(new SchemaAST.Union([SchemaAST.replaceContext(ast, undefined), member]), ast.context)
}

const nullTo = (decode: SchemaGetter.Getter<unknown, null>) =>
  new InternalTransformation.Transformation(
    decode,
    SchemaGetter.forbidden<null, unknown>(() => "Go nil values are never encoded")
  )

const nullAsMissing = nullTo(SchemaGetter.transformOptional<unknown, null>(() => Option.none()))

const nullAsEmptyArray = nullTo(SchemaGetter.transform<unknown, null>(() => []))

const nullAsEmptyRecord = nullTo(SchemaGetter.transform<unknown, null>(() => ({})))

const emptyArray = new SchemaAST.Arrays(false, [], [])

const emptyRecord = SchemaAST.record(SchemaAST.string, SchemaAST.never)

function decodeNull(
  to: SchemaAST.AST,
  transformation: InternalTransformation.Transformation<unknown, null>
): SchemaAST.AST {
  return SchemaAST.decodeTo(SchemaAST.null, to, transformation)
}

// A union this codec already built, so applying it again changes nothing.
function isGoNil(ast: SchemaAST.AST): boolean {
  if (!SchemaAST.isUnion(ast)) return false
  const transformation = ast.types[ast.types.length - 1].encoding?.[0].transformation
  return transformation === nullAsMissing || transformation === nullAsEmptyArray ||
    transformation === nullAsEmptyRecord
}

function toCodecArrayFromSingleASTStep(ast: SchemaAST.AST): SchemaAST.AST {
  return ast._tag === "Declaration" || ast._tag === "Arrays" || ast._tag === "Objects" || ast._tag === "Union" ||
      ast._tag === "Suspend"
    ? ast.recur(toCodecArrayFromSingleAST)
    : ast
}
