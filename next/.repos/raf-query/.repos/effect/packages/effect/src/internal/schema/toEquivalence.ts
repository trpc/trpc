import type * as Cause from "../../Cause.ts"
import * as Equal from "../../Equal.ts"
import * as Equivalence from "../../Equivalence.ts"
import { memoize } from "../../Function.ts"
import * as Predicate from "../../Predicate.ts"
import type * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalAnnotations from "./annotations.ts"

/** @internal */
export const toEquivalence = memoize((ast: SchemaAST.AST): Equivalence.Equivalence<any> => {
  return recur(ast)
})

function recur(ast: SchemaAST.AST): Equivalence.Equivalence<any> {
  // ---------------------------------------------
  // handle annotations
  // ---------------------------------------------
  const annotation = InternalAnnotations.resolve(ast)?.["toEquivalence"] as
    | Schema.Annotations.ToEquivalence.Declaration<any, ReadonlyArray<any>>
    | undefined
  if (annotation) {
    return annotation(SchemaAST.isDeclaration(ast) ? ast.typeParameters.map(recur) : [])
  }
  switch (ast._tag) {
    case "Never":
      return Equivalence.strictEqual()
    case "Declaration":
      return declarationEquivalence(ast)
    case "Null":
    case "Undefined":
    case "Void":
    case "Unknown":
    case "Any":
    case "String":
    case "Number":
    case "Boolean":
    case "BigInt":
    case "Symbol":
    case "Literal":
    case "UniqueSymbol":
    case "ObjectKeyword":
    case "Enum":
    case "TemplateLiteral":
      return Equal.equals
    case "Arrays": {
      const elements = ast.elements.map(recur)
      const rest = ast.rest.map(recur)
      const [head, ...tail] = rest
      const tailLength = tail.length
      return Equivalence.make((a, b) => {
        if (!Array.isArray(a) || !Array.isArray(b)) {
          return false
        }
        const len = a.length
        if (len !== b.length) {
          return false
        }
        // ---------------------------------------------
        // handle elements
        // ---------------------------------------------
        let i = 0
        for (; i < Math.min(len, ast.elements.length); i++) {
          if (!elements[i](a[i], b[i])) {
            return false
          }
        }
        // ---------------------------------------------
        // handle rest element
        // ---------------------------------------------
        if (rest.length > 0) {
          for (; i < len - tailLength; i++) {
            if (!head(a[i], b[i])) {
              return false
            }
          }
          // ---------------------------------------------
          // handle post rest elements
          // ---------------------------------------------
          for (let j = 0; j < tailLength; j++) {
            if (!tail[j](a[i + j], b[i + j])) {
              return false
            }
          }
        }
        return true
      })
    }
    case "Objects": {
      if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) {
        return Equal.equals
      }
      const propertySignatures = ast.propertySignatures.map((ps) => recur(ps.type))
      const indexSignatures = ast.indexSignatures.map((is) => recur(is.type))
      return Equivalence.make((a, b) => {
        if (!Predicate.isObject(a) || !Predicate.isObject(b)) {
          return false
        }
        // ---------------------------------------------
        // handle property signatures
        // ---------------------------------------------
        for (let i = 0; i < propertySignatures.length; i++) {
          const ps = ast.propertySignatures[i]
          const name = ps.name
          const aHas = Object.hasOwn(a, name)
          const bHas = Object.hasOwn(b, name)
          if (SchemaAST.isOptional(ps.type)) {
            if (aHas !== bHas) {
              return false
            }
          }
          if (aHas && bHas && !propertySignatures[i](a[name], b[name])) {
            return false
          }
        }
        // ---------------------------------------------
        // handle index signatures
        // ---------------------------------------------
        for (let i = 0; i < indexSignatures.length; i++) {
          const is = ast.indexSignatures[i]
          const aKeys = SchemaAST.getIndexSignatureKeys(a, is.parameter)
          const bKeys = SchemaAST.getIndexSignatureKeys(b, is.parameter)

          if (aKeys.length !== bKeys.length) return false

          for (let j = 0; j < aKeys.length; j++) {
            const key = aKeys[j]
            if (!Object.hasOwn(b, key) || !indexSignatures[i](a[key], b[key])) {
              return false
            }
          }
        }
        return true
      })
    }
    case "Union": {
      const types = SchemaAST.toType(ast).types
      const index = SchemaAST.getCandidateIndex(types)
      const compiled = types.map((candidate, i) => [SchemaParser._is(candidate), recur(ast.types[i])] as const)
      return Equivalence.make((a, b) => {
        const candidates = index(a, false)
        for (let i = 0; i < candidates.length; i++) {
          const [is, equivalence] = compiled[candidates[i]]
          if (is(a) && is(b)) {
            return equivalence(a, b)
          }
        }
        return false
      })
    }
    case "Suspend": {
      let equivalence: Equivalence.Equivalence<any>
      return Equivalence.make((a, b) => (equivalence ??= toEquivalence(ast.thunk()))(a, b))
    }
  }
}

function declarationEquivalence(ast: SchemaAST.Declaration): Equivalence.Equivalence<any> {
  const representation = (ast.annotations as Schema.Annotations.Declaration<any> | undefined)?.representation
  if (representation === undefined) return Equal.equals
  switch (representation.id) {
    case "effect/schema/Option": {
      const [value] = declarationTypeParameters(ast)
      return (a, b) => a._tag === b._tag && (a._tag === "None" || value(a.value, b.value))
    }
    case "effect/schema/Result": {
      const [success, failure] = declarationTypeParameters(ast)
      return (a, b) =>
        a._tag === b._tag &&
        (a._tag === "Success" ? success(a.success, b.success) : failure(a.failure, b.failure))
    }
    case "effect/schema/CauseReason": {
      const [error, defect] = declarationTypeParameters(ast)
      return causeReasonEquivalence(error, defect)
    }
    case "effect/schema/Cause": {
      const [error, defect] = declarationTypeParameters(ast)
      return causeEquivalence(error, defect)
    }
    case "effect/schema/Exit": {
      const [value, error, defect] = declarationTypeParameters(ast)
      const cause = causeEquivalence(error, defect)
      return (a, b) => a._tag === b._tag && (a._tag === "Success" ? value(a.value, b.value) : cause(a.cause, b.cause))
    }
    case "effect/schema/ReadonlyMap": {
      const [key, value] = declarationTypeParameters(ast)
      return Equal.makeCompareMap(key, value)
    }
    case "effect/schema/ReadonlySet":
      return Equal.makeCompareSet(declarationTypeParameters(ast)[0])
    case "effect/schema/RegExp":
      return (a: globalThis.RegExp, b: globalThis.RegExp) => a.source === b.source && a.flags === b.flags
    case "effect/schema/URL":
      return (a: globalThis.URL, b: globalThis.URL) => a.toString() === b.toString()
    default:
      return Equal.equals
  }
}

function declarationTypeParameters(ast: SchemaAST.Declaration) {
  return ast.typeParameters.map(recur)
}

function causeReasonEquivalence<E>(
  error: Equivalence.Equivalence<E>,
  defect: Equivalence.Equivalence<unknown>
): Equivalence.Equivalence<Cause.Reason<E>> {
  return (a, b) => {
    if (a._tag !== b._tag) return false
    switch (a._tag) {
      case "Fail":
        return error(a.error, (b as Cause.Fail<E>).error)
      case "Die":
        return defect(a.defect, (b as Cause.Die).defect)
      case "Interrupt":
        return a.fiberId === (b as Cause.Interrupt).fiberId
    }
  }
}

function causeEquivalence<E>(
  error: Equivalence.Equivalence<E>,
  defect: Equivalence.Equivalence<unknown>
): Equivalence.Equivalence<Cause.Cause<E>> {
  const reasons = Equivalence.Array(causeReasonEquivalence(error, defect))
  return (a, b) => reasons(a.reasons, b.reasons)
}
