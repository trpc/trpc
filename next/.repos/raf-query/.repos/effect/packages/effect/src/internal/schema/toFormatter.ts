import type * as Cause from "../../Cause.ts"
import * as Chunk from "../../Chunk.ts"
import type * as Exit from "../../Exit.ts"
import type { Formatter } from "../../Formatter.ts"
import { format, formatPropertyKey } from "../../Formatter.ts"
import * as HashMap from "../../HashMap.ts"
import * as HashSet from "../../HashSet.ts"
import * as Option from "../../Option.ts"
import * as Result from "../../Result.ts"
import type * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalAnnotations from "./annotations.ts"

function causeReasonToFormatter<E>(error: Formatter<E>, defect: Formatter<unknown>) {
  return (reason: Cause.Reason<E>) => {
    switch (reason._tag) {
      case "Fail":
        return `Fail(${error(reason.error)})`
      case "Die":
        return `Die(${defect(reason.defect)})`
      case "Interrupt":
        return "Interrupt"
    }
  }
}

function causeToFormatter<E>(error: Formatter<E>, defect: Formatter<unknown>) {
  const causeReason = causeReasonToFormatter(error, defect)
  return (cause: Cause.Cause<E>) => `Cause([${cause.reasons.map(causeReason).join(", ")}])`
}

/** @internal */
export function toFormatter<T>(ast: SchemaAST.AST, options?: {
  readonly onBefore?:
    | ((ast: SchemaAST.AST, recur: (ast: SchemaAST.AST) => Formatter<any>) => Formatter<any> | undefined)
    | undefined
}): Formatter<T> {
  const compiled = new Map<SchemaAST.AST, Formatter<any>>()
  return recur(ast)

  function recur(ast: SchemaAST.AST): Formatter<any> {
    let formatter = compiled.get(ast)
    if (formatter === undefined) {
      formatter = compile(ast)
      compiled.set(ast, formatter)
    }
    return formatter
  }

  function compile(ast: SchemaAST.AST): Formatter<any> {
    const annotation = InternalAnnotations.resolve(ast)?.["toFormatter"]
    if (typeof annotation === "function") {
      return annotation(SchemaAST.isDeclaration(ast) ? ast.typeParameters.map(recur) : [])
    }
    if (options?.onBefore) {
      const onBefore = options.onBefore(ast, recur)
      if (onBefore !== undefined) {
        return onBefore
      }
    }
    return on(ast)
  }

  function on(ast: SchemaAST.AST): Formatter<any> {
    switch (ast._tag) {
      default:
        return format
      case "Never":
        return () => "never"
      case "Void":
        return () => "void"
      case "Declaration": {
        const representation = (ast.annotations as Schema.Annotations.Declaration<any> | undefined)?.representation
        if (representation === undefined) return format
        const typeParameters = ast.typeParameters.map(recur)
        switch (representation.id) {
          case "effect/schema/Option": {
            const [value] = typeParameters
            return Option.match({
              onNone: () => "none()",
              onSome: (value_) => `some(${value(value_)})`
            })
          }
          case "effect/schema/Result": {
            const [success, failure] = typeParameters
            return Result.match({
              onSuccess: (value) => `success(${success(value)})`,
              onFailure: (error) => `failure(${failure(error)})`
            })
          }
          case "effect/schema/CauseReason":
            return causeReasonToFormatter(typeParameters[0], typeParameters[1])
          case "effect/schema/Cause":
            return causeToFormatter(typeParameters[0], typeParameters[1])
          case "effect/schema/Exit": {
            const [value, error, defect] = typeParameters
            const cause = causeToFormatter(error, defect)
            return (exit: Exit.Exit<unknown, unknown>) => {
              switch (exit._tag) {
                case "Success":
                  return `Exit.Success(${value(exit.value)})`
                case "Failure":
                  return `Exit.Failure(${cause(exit.cause)})`
              }
            }
          }
          case "effect/schema/ReadonlyMap": {
            const [key, value] = typeParameters
            return (map: globalThis.ReadonlyMap<unknown, unknown>) => {
              const size = map.size
              if (size === 0) return "ReadonlyMap(0) {}"
              const entries = globalThis.Array.from(map.entries()).sort().map(([key_, value_]) =>
                `${key(key_)} => ${value(value_)}`
              )
              return `ReadonlyMap(${size}) { ${entries.join(", ")} }`
            }
          }
          case "effect/schema/HashMap": {
            const [key, value] = typeParameters
            return (map: HashMap.HashMap<unknown, unknown>) => {
              const size = HashMap.size(map)
              if (size === 0) return "HashMap(0) {}"
              const entries = HashMap.toEntries(map).sort().map(([key_, value_]) => `${key(key_)} => ${value(value_)}`)
              return `HashMap(${size}) { ${entries.join(", ")} }`
            }
          }
          case "effect/schema/ReadonlySet": {
            const [value] = typeParameters
            return (set: globalThis.ReadonlySet<unknown>) => {
              const size = set.size
              if (size === 0) return "ReadonlySet(0) {}"
              const values = globalThis.Array.from(set.values()).sort().map((item) => `${value(item)}`)
              return `ReadonlySet(${size}) { ${values.join(", ")} }`
            }
          }
          case "effect/schema/HashSet": {
            const [value] = typeParameters
            return (set: HashSet.HashSet<unknown>) => {
              const size = HashSet.size(set)
              if (size === 0) return "HashSet(0) {}"
              const values = globalThis.Array.from(set).sort().map((item) => `${value(item)}`)
              return `HashSet(${size}) { ${values.join(", ")} }`
            }
          }
          case "effect/schema/Chunk": {
            const [value] = typeParameters
            return (chunk: Chunk.Chunk<unknown>) => {
              const size = Chunk.size(chunk)
              if (size === 0) return "Chunk(0) {}"
              const values = globalThis.Array.from(chunk).sort().map((item) => `${value(item)}`)
              return `Chunk(${size}) { ${values.join(", ")} }`
            }
          }
          default:
            return format
        }
      }
      case "Arrays": {
        const elements = ast.elements.map((element) => recur(element))
        const rest = ast.rest.map(recur)
        const [head, ...tail] = rest
        const tailLength = tail.length
        return (value) => {
          const out: Array<string> = []
          let i = 0
          for (; i < elements.length; i++) {
            if (value.length < i + 1) {
              if (SchemaAST.isOptional(ast.elements[i])) {
                continue
              }
            } else {
              out.push(elements[i](value[i]))
            }
          }
          if (rest.length > 0) {
            for (; i < value.length - tailLength; i++) {
              out.push(head(value[i]))
            }
            for (let j = 0; j < tailLength; j++) {
              out.push(tail[j](value[i + j]))
            }
          }
          return "[" + out.join(", ") + "]"
        }
      }
      case "Objects": {
        const propertySignatures = ast.propertySignatures.map((signature) => recur(signature.type))
        const indexSignatures = ast.indexSignatures.map((signature) => recur(signature.type))
        if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) {
          return format
        }
        return (value) => {
          const out: Array<string> = []
          const visited = new Set<PropertyKey>()
          for (let i = 0; i < propertySignatures.length; i++) {
            const signature = ast.propertySignatures[i]
            const name = signature.name
            visited.add(name)
            if (SchemaAST.isOptional(signature.type) && !Object.hasOwn(value, name)) {
              continue
            }
            out.push(`${formatPropertyKey(name)}: ${propertySignatures[i](value[name])}`)
          }
          for (let i = 0; i < indexSignatures.length; i++) {
            const keys = SchemaAST.getIndexSignatureKeys(value, ast.indexSignatures[i].parameter)
            for (const key of keys) {
              if (visited.has(key)) {
                continue
              }
              visited.add(key)
              out.push(`${formatPropertyKey(key)}: ${indexSignatures[i](value[key])}`)
            }
          }
          return out.length > 0 ? "{ " + out.join(", ") + " }" : "{}"
        }
      }
      case "Union": {
        const types = SchemaAST.toType(ast).types
        const index = SchemaAST.getCandidateIndex(types)
        const compiled = types.map((candidate, i) => [SchemaParser._is(candidate), recur(ast.types[i])] as const)
        return (value) => {
          const candidates = index(value, false)
          for (let i = 0; i < candidates.length; i++) {
            const [is, formatter] = compiled[candidates[i]]
            if (is(value)) {
              return formatter(value)
            }
          }
          return format(value)
        }
      }
      case "Suspend": {
        let formatter: Formatter<any>
        return (value) => (formatter ??= recur(ast.thunk()))(value)
      }
    }
  }
}
