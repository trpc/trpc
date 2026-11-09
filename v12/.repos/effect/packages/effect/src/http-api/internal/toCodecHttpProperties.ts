import { memoize } from "../../Function.ts"
import * as Option from "../../Option.ts"
import * as Predicate from "../../Predicate.ts"
import * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaGetter from "../../SchemaGetter.ts"
import * as SchemaTransformation from "../../SchemaTransformation.ts"

/** @internal */
export function toCodecHttpProperties<S extends Schema.Constraint>(schema: S): Schema.toCodecStringTree<S> {
  const codec = Schema.toCodecStringTree(schema)
  return codec.rebuild(normalizeProperties(codec.ast))
}

const omitUndefined = new SchemaTransformation.Transformation(
  SchemaGetter.passthrough(),
  SchemaGetter.transformOptional(Option.filter(Predicate.isNotUndefined))
)

// Only descend through unions and suspensions, leaving nested values alone.
const present = memoize((ast: SchemaAST.AST): SchemaAST.AST => {
  if (ast._tag === "Undefined") return new SchemaAST.Never(ast.annotations, undefined, undefined, ast.context)
  if (ast._tag === "Suspend") return ast.recur(present)
  if (ast._tag !== "Union") return ast

  const members = SchemaAST.mapOrSame(ast.types, present)
  if (members === ast.types) return ast
  const types = members.filter((member) => member._tag !== "Never")
  if (types.length === 1 && ast.checks === undefined && ast.annotations === undefined) {
    return SchemaAST.replaceContext(types[0], ast.context)
  }
  return new SchemaAST.Union(types, ast.options, ast.annotations, ast.checks, undefined, ast.context)
})

const normalizeProperties = SchemaAST.applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  if (ast._tag === "Union" || ast._tag === "Suspend") return ast.recur(normalizeProperties)
  if (ast._tag !== "Objects") return ast

  const properties = SchemaAST.mapOrSame(ast.propertySignatures, (ps) => {
    const encoded = SchemaAST.toEncoded(ps.type)
    if (!SchemaAST.isOptional(encoded)) return ps
    const wire = present(encoded)
    return wire === encoded
      ? ps
      : new SchemaAST.PropertySignature(ps.name, SchemaAST.decodeTo(wire, ps.type, omitUndefined))
  })
  return properties === ast.propertySignatures ? ast : new SchemaAST.Objects(
    properties,
    ast.indexSignatures,
    ast.annotations,
    ast.checks,
    undefined,
    ast.context,
    ast.encodingChecks
  )
})
