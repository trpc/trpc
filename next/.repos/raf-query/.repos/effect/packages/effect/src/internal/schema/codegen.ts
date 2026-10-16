import type { CompiledDecoder } from "../../schema/SchemaCompiler.ts"
import type { runtime } from "../../schema/SchemaCompiler/runtime.ts"
import * as SchemaAST from "../../SchemaAST.ts"

const getEncodingChecks = (ast: SchemaAST.AST): SchemaAST.Checks | undefined =>
  "encodingChecks" in ast ? ast.encodingChecks : undefined
const getExpectedKeys = (ast: SchemaAST.Objects): ReadonlyArray<PropertyKey> =>
  ast.propertySignatures.map((p) => typeof p.name === "number" ? String(p.name) : p.name)

const isOptional = (ast: SchemaAST.AST): boolean => ast.context?.isOptional ?? false

const maxGeneratedDepth = 256
/** @internal */
export const maxGeneratedNodes = 2048

type Emission = "unsupported" | "decode" | "is"
type Operation = "decode" | "is"

const failureExpression = (operation: Operation): string => operation === "decode" ? "I" : "false"

type Facts = {
  supported: boolean
  outputFree: boolean
  makeSafe: boolean
  hasOneOf: boolean
  nodes: number
  height: number
}

const factsCache = new WeakMap<SchemaAST.AST, Facts>()

const unsupportedFacts: Facts = {
  supported: false,
  outputFree: false,
  makeSafe: false,
  hasOneOf: false,
  nodes: 1,
  height: 0
}

const isMakeSafeNode = (ast: SchemaAST.AST): boolean =>
  ast._tag !== "Union" && ast._tag !== "Declaration" && ast._tag !== "Suspend" &&
  (ast._tag !== "Objects" || ast.indexSignatures.length === 0) &&
  ast.encoding === undefined &&
  ast.context?.constructorDefault === undefined

const addChild = (
  facts: Facts,
  child: SchemaAST.AST,
  depth: number,
  budget: { remaining: number }
): boolean => {
  if (child.encoding !== undefined || child._tag === "Declaration" || child._tag === "Suspend") {
    facts.supported = false
    return false
  }
  switch (child._tag) {
    case "TemplateLiteral":
    case "Arrays":
    case "Objects":
    case "Union": {
      const childFacts = getFacts(child, depth, budget)
      if (childFacts === undefined) return false
      if (!childFacts.supported) {
        facts.supported = false
        return false
      }
      if (!childFacts.outputFree) facts.outputFree = false
      if (!childFacts.makeSafe) facts.makeSafe = false
      if (childFacts.hasOneOf) facts.hasOneOf = true
      facts.nodes += childFacts.nodes
      if (childFacts.height >= facts.height) facts.height = childFacts.height + 1
      return true
    }
    default:
      if (--budget.remaining < 0 || depth > maxGeneratedDepth) return false
      if (!isMakeSafeNode(child)) facts.makeSafe = false
      facts.nodes++
      if (facts.height === 0) facts.height = 1
      return true
  }
}

const stop = (ast: SchemaAST.AST, facts: Facts): Facts | undefined => {
  if (facts.supported) return undefined
  factsCache.set(ast, unsupportedFacts)
  return unsupportedFacts
}

const getFacts = (
  ast: SchemaAST.AST,
  depth = 0,
  budget = { remaining: maxGeneratedNodes }
): Facts | undefined => {
  const cached = factsCache.get(ast)
  if (cached !== undefined) {
    budget.remaining -= cached.nodes
    return budget.remaining < 0 || depth + cached.height > maxGeneratedDepth ? undefined : cached
  }
  if (--budget.remaining < 0 || depth > maxGeneratedDepth) return undefined
  const facts: Facts = {
    supported: true,
    outputFree: true,
    makeSafe: true,
    hasOneOf: ast._tag === "Union" && ast.options?.mode === "oneOf",
    nodes: 1,
    height: 0
  }
  const next = depth + 1
  switch (ast._tag) {
    case "TemplateLiteral":
      for (const part of ast.parts) {
        if (!addChild(facts, part, next, budget)) return stop(ast, facts)
      }
      // matchPart only segments the input; the tuple parser enforces oneOf.
      if (facts.hasOneOf) {
        facts.supported = false
        return stop(ast, facts)
      }
      break
    case "Arrays":
      for (const element of ast.elements) {
        if (!addChild(facts, element, next, budget)) return stop(ast, facts)
      }
      for (const element of ast.rest) {
        if (!addChild(facts, element, next, budget)) return stop(ast, facts)
      }
      break
    case "Objects":
      for (const property of ast.propertySignatures) {
        if (!addChild(facts, property.type, next, budget)) return stop(ast, facts)
      }
      for (const signature of ast.indexSignatures) {
        if (
          !addChild(facts, SchemaAST.parameterFromPropertyKey(signature.parameter), next, budget) ||
          !addChild(facts, signature.type, next, budget)
        ) return stop(ast, facts)
      }
      break
    case "Union":
      for (const type of ast.types) {
        if (!addChild(facts, type, next, budget)) return stop(ast, facts)
      }
      break
  }
  facts.outputFree = ast._tag === "Arrays" || ast._tag === "Objects" || ast._tag === "Union"
    ? ast.checks === undefined && facts.outputFree
    : true
  facts.makeSafe = facts.makeSafe && isMakeSafeNode(ast)
  factsCache.set(ast, facts)
  return facts
}

/** @internal */
const getEmission = (ast: SchemaAST.AST, depth = 0, local = false): Emission => {
  if (!local && ast.encoding !== undefined || ast._tag === "Declaration" || ast._tag === "Suspend") {
    return "unsupported"
  }
  const facts = getFacts(ast, depth)
  if (facts === undefined || !facts.supported) return "unsupported"
  return facts.outputFree ? "is" : "decode"
}

const isMakeSafe = (ast: SchemaAST.AST): boolean => getFacts(ast)?.makeSafe ?? false

const shouldCompileMake = (ast: SchemaAST.AST): ast is SchemaAST.Arrays | SchemaAST.Objects =>
  (ast._tag === "Arrays" && ast.elements.length === 0 && ast.rest.length === 1 ||
    ast._tag === "Objects" && ast.propertySignatures.length > 0 && ast.indexSignatures.length === 0) &&
  isMakeSafe(ast)

type Emitter = {
  readonly statements: Array<string>
  readonly helpers: Array<string>
  readonly initializers: Array<string>
  readonly decoderHelpers: Map<SchemaAST.AST, string>
  readonly unionHelpers: Map<SchemaAST.Union, string>
  readonly bindings: Array<Binding>
  readonly constantIndexes: Map<unknown, number>
  next: number
}

const variable = (emitter: Emitter): string => `v${emitter.next++}`

const propertyKey = (emitter: Emitter, key: PropertyKey, reference: string): string =>
  typeof key === "string" ? JSON.stringify(key) : constant(emitter, key, reference)

const propertyPresence = (input: string, key: string, name: PropertyKey): string =>
  name === "__proto__" ? `Object.hasOwn(${input},${key})` : `${key} in ${input}`

const assignProperty = (output: string, key: string, value: string, name: PropertyKey): string =>
  name === "__proto__"
    ? `Object.defineProperty(${output},${key},{value:${value},writable:true,enumerable:true,configurable:true})`
    : `${output}[${key}]=${value}`

const constant = (emitter: Emitter, value: unknown, reference: string): string => {
  const cached = emitter.constantIndexes.get(value)
  if (cached !== undefined) return `C[${cached}]`
  const index = emitter.bindings.length
  emitter.bindings.push({ value, reference })
  emitter.constantIndexes.set(value, index)
  return `C[${index}]`
}

const needsPresenceCheck = (ast: SchemaAST.AST): boolean => {
  switch (ast._tag) {
    case "Undefined":
    case "Void":
    case "Any":
    case "Unknown":
      return true
    case "Union":
      return ast.types.some(needsPresenceCheck)
    default:
      return false
  }
}

const propertyNeedsPresenceCheck = (name: PropertyKey, ast: SchemaAST.AST): boolean =>
  name === "__proto__" || needsPresenceCheck(ast)

/** @internal */
export const shouldCompileParser = (ast: SchemaAST.AST, local = false): boolean => {
  if (!local && ast.encoding !== undefined) return true
  if (SchemaAST.getConstructorDescriptor(ast) !== undefined) return true
  if (ast.checks !== undefined || getEncodingChecks(ast) !== undefined) return true
  switch (ast._tag) {
    case "TemplateLiteral":
    case "Arrays":
    case "Objects":
    case "Union":
      return true
    default:
      return false
  }
}

const lookupMemberValues = (ast: SchemaAST.AST): ReadonlyArray<unknown> | undefined => {
  if (ast.checks !== undefined || getEncodingChecks(ast) !== undefined || ast.encoding !== undefined) return undefined
  switch (ast._tag) {
    case "Null":
      return [null]
    case "Undefined":
      return [undefined]
    case "Literal":
      return [ast.literal]
    case "UniqueSymbol":
      return [ast.symbol]
    case "Enum":
      return [...new Set(ast.enums.map((entry) => entry[1]))]
    default:
      return undefined
  }
}

const lookupMemberReferences = (ast: SchemaAST.AST, path: string): ReadonlyArray<string> => {
  switch (ast._tag) {
    case "Null":
      return ["null"]
    case "Undefined":
      return ["void 0"]
    case "Literal":
      return [`${path}.literal`]
    case "UniqueSymbol":
      return [`${path}.symbol`]
    case "Enum": {
      const references = new Map<unknown, string>()
      ast.enums.forEach((entry, index) => {
        if (!references.has(entry[1])) references.set(entry[1], `${path}.enums[${index}][1]`)
      })
      return [...references.values()]
    }
    default:
      throw new Error(`Unsupported lookup member: ${ast._tag}`)
  }
}

function emit(
  ast: SchemaAST.AST,
  input: string,
  statements: Array<string>,
  emitter: Emitter,
  operation: Operation,
  path: string
): string {
  const output = emitBase(ast, input, statements, emitter, operation, path)
  const invalid = failureExpression(operation)
  const encodingChecks = getEncodingChecks(ast)
  const astConstant = ast.checks !== undefined || encodingChecks !== undefined
    ? constant(emitter, ast, path)
    : undefined
  if (encodingChecks !== undefined) {
    statements.push(`if(K(${astConstant},${input},1,o))return ${invalid}`)
  }
  if (ast.checks === undefined) return operation === "decode" ? output : "true"
  const checked = variable(emitter)
  statements.push(
    `const ${checked}=${output}`,
    `if(K(${astConstant},${checked},0,o))return ${invalid}`
  )
  return operation === "decode" ? checked : "true"
}

const emitDecoderHelper = (ast: SchemaAST.AST, emitter: Emitter, operation: Operation, path: string): string => {
  const cached = emitter.decoderHelpers.get(ast)
  if (cached !== undefined) return cached
  const name = `d${emitter.next++}`
  emitter.decoderHelpers.set(ast, name)
  const statements: Array<string> = []
  const output = emit(ast, "i", statements, emitter, operation, path)
  emitter.helpers.push(
    `function ${name}(i,o){${statements.join(";")};return ${output}}`
  )
  return name
}

const emitUnionHelper = (ast: SchemaAST.Union, emitter: Emitter, operation: Operation, path: string): string => {
  const cached = emitter.unionHelpers.get(ast)
  if (cached !== undefined) return cached
  const name = `u${emitter.next++}`
  emitter.unionHelpers.set(ast, name)
  const decoders = ast.types.map((type, index) =>
    emitDecoderHelper(type, emitter, operation, `${path}.types[${index}]`)
  )
  emitter.initializers.push(`const ${name}=[${decoders.join(",")}]`)
  return name
}

const emitIndexes = (
  ast: SchemaAST.Objects,
  input: string,
  output: string | undefined,
  statements: Array<string>,
  emitter: Emitter,
  operation: Operation,
  path: string,
  indexKeys: string
): void => {
  const fixedKeys = output === undefined || ast.propertySignatures.length === 0
    ? undefined
    : constant(
      emitter,
      new Set(getExpectedKeys(ast)),
      `new Set(${runtimeReference("getExpectedKeys")}(${path}))`
    )
  for (let signatureIndex = 0; signatureIndex < ast.indexSignatures.length; signatureIndex++) {
    const signature = ast.indexSignatures[signatureIndex]
    const signaturePath = `${path}.indexSignatures[${signatureIndex}]`
    const keys = variable(emitter)
    const index = variable(emitter)
    const key = variable(emitter)
    const parameter = signature.parameter
    statements.push(
      `const ${keys}=${indexKeys}?.[${signatureIndex}]??${
        parameter._tag === "String" && parameter.checks === undefined
          ? `Object.keys(${input})`
          : `G(${input},${constant(emitter, parameter, `${signaturePath}.parameter`)},o)`
      }`
    )
    const loop: Array<string> = [`const ${key}=${keys}[${index}]`]
    const decodedKey = parameter._tag === "String" && parameter.checks === undefined && parameter.encoding === undefined
      ? key
      : emit(
        SchemaAST.parameterFromPropertyKey(parameter),
        key,
        loop,
        emitter,
        operation,
        `${runtimeReference("parameterFromPropertyKey")}(${signaturePath}.parameter)`
      )
    const value = variable(emitter)
    loop.push(`const ${value}=${input}[${key}]`)
    const decoded = emit(signature.type, value, loop, emitter, operation, `${signaturePath}.type`)
    if (output !== undefined) {
      const assign =
        `if(${decodedKey}==="__proto__")Object.defineProperty(${output},${decodedKey},{value:${decoded},writable:true,enumerable:true,configurable:true});else ${output}[${decodedKey}]=${decoded}`
      loop.push(
        fixedKeys === undefined
          ? assign
          : `if(!${fixedKeys}.has(${key})&&!${fixedKeys}.has(${decodedKey})){${assign}}`
      )
    }
    statements.push(`for(let ${index}=0;${index}<${keys}.length;${index}++){${loop.join(";")}}`)
  }
}

const emitBase = (
  ast: SchemaAST.AST,
  input: string,
  statements: Array<string>,
  emitter: Emitter,
  operation: Operation,
  path: string
): string => {
  const needsValue = operation === "decode"
  const invalid = failureExpression(operation)
  switch (ast._tag) {
    case "Null":
      statements.push(`if(${input}!==null)return ${invalid}`)
      return input
    case "Undefined":
      statements.push(`if(${input}!==void 0)return ${invalid}`)
      return input
    case "Void":
      return "void 0"
    case "Never":
      statements.push(`return ${invalid}`)
      return input
    case "Any":
    case "Unknown":
      return input
    case "ObjectKeyword":
      statements.push(
        `if((${input}===null||typeof ${input}!=="object")&&typeof ${input}!=="function")return ${invalid}`
      )
      return input
    case "Enum": {
      const values = constant(
        emitter,
        new Set(ast.enums.map((entry) => entry[1])),
        `new Set(${path}.enums.map(entry=>entry[1]))`
      )
      statements.push(`if(!${values}.has(${input}))return ${invalid}`)
      return input
    }
    case "UniqueSymbol": {
      const value = constant(emitter, ast.symbol, `${path}.symbol`)
      statements.push(`if(${input}!==${value})return ${invalid}`)
      return input
    }
    case "Literal": {
      const value = constant(emitter, ast.literal, `${path}.literal`)
      statements.push(`if(${input}!==${value})return ${invalid}`)
      return input
    }
    case "String":
      statements.push(`if(typeof ${input}!=="string")return ${invalid}`)
      return input
    case "Number":
      statements.push(`if(typeof ${input}!=="number")return ${invalid}`)
      return input
    case "Boolean":
      statements.push(`if(typeof ${input}!=="boolean")return ${invalid}`)
      return input
    case "Symbol":
      statements.push(`if(typeof ${input}!=="symbol")return ${invalid}`)
      return input
    case "BigInt":
      statements.push(`if(typeof ${input}!=="bigint")return ${invalid}`)
      return input
    case "TemplateLiteral": {
      const template = constant(emitter, ast, path)
      statements.push(`if(!T(${template},${input},o))return ${invalid}`)
      return input
    }
    case "Arrays": {
      statements.push(`if(!Array.isArray(${input}))return ${invalid}`)
      const length = variable(emitter)
      statements.push(`const ${length}=${input}.length`)
      const elementLength = ast.elements.length
      const requiredElementLength = ast.elements.findIndex(isOptional)
      const minimumElementLength = requiredElementLength === -1 ? elementLength : requiredElementLength
      const tailLength = Math.max(0, ast.rest.length - 1)
      if (ast.rest.length === 0) {
        statements.push(
          minimumElementLength === elementLength
            ? `if(${length}!==${elementLength})return ${invalid}`
            : `if(${length}<${minimumElementLength}||${length}>${elementLength})return ${invalid}`
        )
        if (minimumElementLength === elementLength) {
          const elements = ast.elements.map((element, index) => {
            const value = variable(emitter)
            statements.push(`const ${value}=${input}[${index}]`)
            return emit(element, value, statements, emitter, operation, `${path}.elements[${index}]`)
          })
          return needsValue ? `[${elements.join(",")}]` : input
        }
        const output = needsValue ? variable(emitter) : undefined
        if (output !== undefined) statements.push(`const ${output}=new Array(${length})`)
        for (let index = 0; index < elementLength; index++) {
          const value = variable(emitter)
          const elementStatements: Array<string> = [`const ${value}=${input}[${index}]`]
          const decoded = emit(
            ast.elements[index],
            value,
            elementStatements,
            emitter,
            operation,
            `${path}.elements[${index}]`
          )
          if (output !== undefined) elementStatements.push(`${output}[${index}]=${decoded}`)
          statements.push(
            index < minimumElementLength
              ? elementStatements.join(";")
              : `if(${index}<${length}){${elementStatements.join(";")}}`
          )
        }
        return output ?? input
      }
      statements.push(`if(${length}<${minimumElementLength + tailLength})return ${invalid}`)
      const output = needsValue ? variable(emitter) : undefined
      if (output !== undefined) statements.push(`const ${output}=new Array(${length})`)
      for (let index = 0; index < elementLength; index++) {
        const value = variable(emitter)
        const elementStatements: Array<string> = [`const ${value}=${input}[${index}]`]
        const decoded = emit(
          ast.elements[index],
          value,
          elementStatements,
          emitter,
          operation,
          `${path}.elements[${index}]`
        )
        if (output !== undefined) elementStatements.push(`${output}[${index}]=${decoded}`)
        statements.push(
          index < minimumElementLength
            ? elementStatements.join(";")
            : `if(${index}<${length}){${elementStatements.join(";")}}`
        )
      }
      const index = variable(emitter)
      const restStatements: Array<string> = []
      const value = variable(emitter)
      restStatements.push(`const ${value}=${input}[${index}]`)
      const decoded = emit(ast.rest[0], value, restStatements, emitter, operation, `${path}.rest[0]`)
      if (output !== undefined) restStatements.push(`${output}[${index}]=${decoded}`)
      statements.push(
        `for(let ${index}=${elementLength};${index}<${length}-${tailLength};${index}++){${restStatements.join(";")}}`
      )
      for (let index = 0; index < tailLength; index++) {
        const inputIndex = `${length}-${tailLength - index}`
        const value = variable(emitter)
        statements.push(`const ${value}=${input}[${inputIndex}]`)
        const decoded = emit(ast.rest[index + 1], value, statements, emitter, operation, `${path}.rest[${index + 1}]`)
        if (output !== undefined) statements.push(`${output}[${inputIndex}]=${decoded}`)
      }
      return output ?? input
    }
    case "Objects": {
      if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) {
        statements.push(`if(${input}===null||${input}===void 0)return ${invalid}`)
        return input
      }
      statements.push(
        `if(typeof ${input}!=="object"||${input}===null||Array.isArray(${input}))return ${invalid}`
      )
      // Strict parsing collects index keys before reading any declared fields,
      // just like the interpreter. Reuse that snapshot when decoding the indexes.
      const object = constant(emitter, ast, path)
      const strict = `o!==D&&o.onExcessProperty==="error"`
      const indexKeys = ast.indexSignatures.length > 0 ? variable(emitter) : undefined
      if (indexKeys !== undefined) {
        statements.push(
          `const ${indexKeys}=${strict}?${object}.indexSignatures.map(p=>G(${input},p.parameter,o)):void 0`
        )
      }
      statements.push(
        `if(${indexKeys ?? strict}&&E(${object},${input},${indexKeys ?? "void 0"}))return ${invalid}`
      )
      const output = needsValue ? variable(emitter) : undefined
      const hasOptional = ast.propertySignatures.some((property) => isOptional(property.type))
      if (output !== undefined && ast.propertySignatures.length > 0 && !hasOptional) {
        const properties = ast.propertySignatures.map((property, index) => {
          const propertyPath = `${path}.propertySignatures[${index}]`
          const key = propertyKey(emitter, property.name, `${propertyPath}.name`)
          const outputKey = typeof property.name === "string" && property.name !== "__proto__" ? key : `[${key}]`
          const value = variable(emitter)
          if (propertyNeedsPresenceCheck(property.name, property.type)) {
            statements.push(`if(!(${propertyPresence(input, key, property.name)}))return ${invalid}`)
          }
          statements.push(`const ${value}=${input}[${key}]`)
          return `${outputKey}:${emit(property.type, value, statements, emitter, operation, `${propertyPath}.type`)}`
        })
        statements.push(`const ${output}={${properties.join(",")}}`)
      } else {
        if (output !== undefined) statements.push(`const ${output}={}`)
        for (let propertyIndex = 0; propertyIndex < ast.propertySignatures.length; propertyIndex++) {
          const property = ast.propertySignatures[propertyIndex]
          const propertyPath = `${path}.propertySignatures[${propertyIndex}]`
          const key = propertyKey(emitter, property.name, `${propertyPath}.name`)
          const value = variable(emitter)
          const propertyStatements: Array<string> = [`const ${value}=${input}[${key}]`]
          const decoded = emit(property.type, value, propertyStatements, emitter, operation, `${propertyPath}.type`)
          if (output !== undefined) propertyStatements.push(assignProperty(output, key, decoded, property.name))
          statements.push(
            isOptional(property.type)
              ? `if(${propertyPresence(input, key, property.name)}){${propertyStatements.join(";")}}`
              : `${
                propertyNeedsPresenceCheck(property.name, property.type)
                  ? `if(!(${propertyPresence(input, key, property.name)}))return ${invalid};`
                  : ""
              }${propertyStatements.join(";")}`
          )
        }
      }
      if (indexKeys !== undefined) emitIndexes(ast, input, output, statements, emitter, operation, path, indexKeys)
      return output ?? input
    }
    case "Union": {
      const memberValues = ast.types.map(lookupMemberValues)
      if (memberValues.every((values) => values !== undefined)) {
        const references = ast.types.map((type, index) => lookupMemberReferences(type, `${path}.types[${index}]`))
        if (ast.options?.mode !== "oneOf") {
          const values = constant(emitter, new Set(memberValues.flat()), `new Set([${references.flat().join(",")}])`)
          statements.push(`if(!${values}.has(${input}))return ${invalid}`)
        } else {
          const counts = new Map<unknown, number>()
          const valueReferences = new Map<unknown, string>()
          for (let memberIndex = 0; memberIndex < memberValues.length; memberIndex++) {
            const values = memberValues[memberIndex]
            for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
              const value = values[valueIndex]
              counts.set(value, (counts.get(value) ?? 0) + 1)
              if (!valueReferences.has(value)) valueReferences.set(value, references[memberIndex][valueIndex])
            }
          }
          const entries = [...counts].map(([value, count]) => `[${valueReferences.get(value)},${count}]`)
          const lookup = constant(emitter, counts, `new Map([${entries.join(",")}])`)
          statements.push(`if(${lookup}.get(${input})!==1)return ${invalid}`)
        }
        return input
      }
      const candidates = variable(emitter)
      const output = variable(emitter)
      const candidate = variable(emitter)
      const index = variable(emitter)
      const decoder = variable(emitter)
      const types = constant(emitter, ast.types, `${path}.types`)
      const decoders = emitUnionHelper(ast, emitter, operation, path)
      const select = variable(emitter)
      emitter.initializers.push(`const ${select}=U(${types})`)
      statements.push(
        `const ${candidates}=${select}(${input},false)`,
        `let ${output}=${invalid},${candidate},${decoder}`
      )
      if (ast.options?.mode !== "oneOf") {
        statements.push(
          `for(let ${index}=0;${index}<${candidates}.length;${index}++){${decoder}=${decoders}[${candidates}[${index}]];${candidate}=${decoder}(${input},o);if(${candidate}!==${invalid}){${output}=${candidate};break}}`
        )
        statements.push(`if(${output}===${invalid})return ${invalid}`)
      } else {
        const successes = variable(emitter)
        statements.push(`let ${successes}=0`)
        statements.push(
          `for(let ${index}=0;${index}<${candidates}.length;${index}++){${decoder}=${decoders}[${candidates}[${index}]];${candidate}=${decoder}(${input},o);if(${candidate}!==${invalid}){if(++${successes}>1)return ${invalid};${output}=${candidate}}}`
        )
        statements.push(`if(${successes}!==1)return ${invalid}`)
      }
      return output
    }
    default:
      throw new Error(`Unsupported Schema AST: ${ast._tag}`)
  }
}

/** @internal */
export interface Binding {
  readonly value: unknown
  readonly reference: string
}

/** @internal */
export const runtimeReference = (name: keyof typeof runtime): string => `R.${name}`

const runtimeBindings = (aliases: Readonly<Record<string, keyof typeof runtime>>): string =>
  `const {${Object.entries(aliases).map(([alias, name]) => `${name}:${alias}`).join(",")}}=R;`

/** @internal */
export interface GeneratedOperation {
  readonly source: string
  readonly bindings: ReadonlyArray<Binding>
}

const emitOperation = (ast: SchemaAST.AST, operation: Operation, path = "ast"): GeneratedOperation => {
  const emitter: Emitter = {
    statements: [],
    helpers: [],
    initializers: [],
    decoderHelpers: new Map(),
    unionHelpers: new Map(),
    bindings: [],
    constantIndexes: new Map(),
    next: 0
  }
  const output = emit(ast, "i", emitter.statements, emitter, operation, path)
  const bindings = {
    K: "getCheckIssues",
    T: "matchesTemplateLiteral",
    U: "getCandidateIndex",
    G: "getIndexSignatureKeys",
    D: "defaultParseOptions",
    E: "hasExcessProperties"
  } as const
  const source = `"use strict";${runtimeBindings(operation === "decode" ? { I: "invalid", ...bindings } : bindings)}${
    emitter.helpers.join(";")
  };${emitter.initializers.join(";")};return function(i,o){${emitter.statements.join(";")};return ${output}}`
  return { source, bindings: emitter.bindings }
}

/** @internal */
export type DecoderOperation = keyof CompiledDecoder

const renderOperation = (emitted: GeneratedOperation): string =>
  `(function(C,R){${emitted.source}})([${emitted.bindings.map((binding) => binding.reference).join(",")}],R)`

/** @internal */
export function generate(ast: SchemaAST.AST, operation: DecoderOperation): string | undefined {
  if (operation === "make") {
    if (!shouldCompileMake(ast)) return undefined
    if (ast._tag === "Objects") {
      return `if(ast.propertySignatures.some(p=>resolve(p.type).compiled!==void 0))return;return ${
        renderOperation(emitOperation(ast, "decode"))
      }`
    }
    const element = renderOperation(emitOperation(ast.rest[0], "decode", "ast.rest[0]"))
    return `const e=resolve(ast.rest[0]),m=e.compiled===void 0?${element}:e.make;if(m===void 0)return;` +
      "return function(i,o){if(i===R.missing)return R.missing;if(!Array.isArray(i))return R.invalid;" +
      "const out=new Array(i.length);for(let x=0;x<i.length;x++){const v=m(i[x],o);" +
      "if(v===R.invalid||v===R.missing)return R.invalid;out[x]=v}" +
      "return R.getCheckIssues(ast,out,false,o)?R.invalid:out}"
  }
  if (operation === "is" || operation === "decode") {
    if (!shouldCompileParser(ast)) return undefined
    const emission = getEmission(ast)
    if (emission === "unsupported" || operation === "is" && emission !== "is") return undefined
    return "return " + renderOperation(emitOperation(ast, operation))
  }
  if (operation === "decodeEffect") {
    const encoding = emitEncoding(ast)
    if (encoding !== undefined) return encoding
  }
  const object = ast._tag === "Objects" && ast.propertySignatures.length > 0 &&
      ast.indexSignatures.length === 0 && ast.propertySignatures.length <= maxGeneratedNodes
    ? emitObject(ast)
    : "undefined"
  const array = ast._tag === "Arrays" && ast.elements.length === 0 && ast.rest.length === 1
    ? emitArray()
    : "undefined"
  if (operation === "makeEffect") return `return R.make(ast,resolve,${object},${array})`
  const checkpoint = ast.encoding !== undefined && getEmission(ast, 0, true) !== "unsupported"
    ? `()=>${renderOperation(emitOperation(ast, "decode"))}`
    : "undefined"
  return `return R.decode(ast,resolve,${object},${getEmission(ast) !== "unsupported"},${checkpoint},${array})`
}

const emitArray = (): string =>
  `function({getElement,step,resume}){return function(s,input,index=0,end=input.length){
    const parser=getElement();let r,t,value;
    for(;index<end;index++){
      const item=input[index];r=parser(item,s.options);
      if(r===R.sameExit&&item!==R.missing){s.output[index]=item;continue}
      if(!R.effectIsExit(r))return resume(s,item,index,r,end);
      if(r._tag==="Success"&&(value=r===R.sameExit?item:r[R.args])!==R.missing){s.output[index]=value}
      else{t=step(s,item,r,index);if(t)return t}
    }
  }}`

const inlineTypePredicate = (ast: SchemaAST.AST, input: string, path: string): string | undefined => {
  switch (ast._tag) {
    case "Null":
      return `${input}===null`
    case "Undefined":
      return `${input}===void 0`
    case "Never":
      return "false"
    case "Any":
    case "Unknown":
      return "true"
    case "ObjectKeyword":
      return `((${input}!==null&&typeof ${input}==="object")||typeof ${input}==="function")`
    case "UniqueSymbol":
      return `${input}===${path}.symbol`
    case "Literal":
      return `${input}===${path}.literal`
    case "String":
      return `typeof ${input}==="string"`
    case "Number":
      return `typeof ${input}==="number"`
    case "Boolean":
      return `typeof ${input}==="boolean"`
    case "Symbol":
      return `typeof ${input}==="symbol"`
    case "BigInt":
      return `typeof ${input}==="bigint"`
    case "TemplateLiteral":
      // Its parser reports structured issues, not an InvalidType failure.
      return undefined
    default:
      return undefined
  }
}

const emitEncoding = (ast: SchemaAST.AST): string | undefined => {
  const links = ast.encoding
  if (links?.length !== 1 || getEncodingChecks(ast) !== undefined) return undefined
  const link = links[0]
  const transformation = link.transformation
  if (
    link.to.encoding !== undefined ||
    getEncodingChecks(link.to) !== undefined ||
    transformation._tag !== "Transformation" ||
    transformation.decode._tag !== "Transform"
  ) {
    return undefined
  }
  const source = inlineTypePredicate(link.to, "i", "ast.encoding[0].to")
  const target = inlineTypePredicate(ast, "value", "ast")
  if (source === undefined || target === undefined) return undefined
  const success = ast.checks === undefined ? "R.succeed(value)" : "R.check(ast,value,o)"
  const sourceChecks = link.to.checks === undefined
    ? ""
    : "const issues=R.getCheckIssues(from,i,false,o);" +
      "if(issues!==void 0)return R.invalidEncodingChecks(ast,i,issues,o);"
  return `const transform=ast.encoding[0].transformation.decode.transform,from=ast.encoding[0].to;return function(i,o){try{
    if(i===R.missing)return R.missingExit;
    if(!(${source}))return R.invalidEncoding(ast,1,i,i,o);
    ${sourceChecks}const value=transform(i);
    if(value===R.missing)return R.missingExit;
    if(!(${target}))return R.invalidEncoding(ast,0,i,value,o);
    return ${success}
  }catch(e){return R.die(e)}}`
}

const canInlineEncoding = (ast: SchemaAST.AST): ast is SchemaAST.AST & { readonly encoding: SchemaAST.Encoding } =>
  ast.encoding !== undefined &&
  ast.checks === undefined &&
  getEncodingChecks(ast) === undefined &&
  inlineTypePredicate(ast, "v", "ast") !== undefined &&
  ast.encoding.every((link, index, links) =>
    link.to.encoding === undefined &&
    getEncodingChecks(link.to) === undefined &&
    // Only the initial source may have checks; they run before any transformation.
    (link.to.checks === undefined || index === links.length - 1) &&
    inlineTypePredicate(link.to, "v", "ast") !== undefined &&
    link.transformation._tag === "Transformation" &&
    (link.transformation.decode._tag === "Passthrough" || link.transformation.decode._tag === "Transform")
  )

const inlinePropertyHandler =
  `const handle=(state,index,property,present,input,result)=>{let value;if(result===R.sameExit){if(!present)return;value=input}else{if(!R.effectIsExit(result))return resume(state,index,result);if(result._tag!=="Success"||(value=result[R.args])===R.missing)return step(state,property,result)}const name=property.name;if(name==="__proto__")Object.defineProperty(state.out,name,{value,writable:true,enumerable:true,configurable:true});else state.out[name]=value}`

const emitObject = (ast: SchemaAST.Objects): string => {
  const initializers: Array<string> = []
  const transforms = new Map<object, string>()
  const bindTransform = (transform: object, path: string): string => {
    let name = transforms.get(transform)
    if (name === undefined) {
      name = `t${transforms.size}`
      transforms.set(transform, name)
      initializers.push(`const ${name}=${path}`)
    }
    return name
  }
  let usesInlinePropertyHandler = false
  let usesInlinePropertyFailure = false
  let usesInlineSourceFailure = false
  const lazyProperties = ast.propertySignatures.every((property) =>
    typeof property.name !== "symbol" && canInlineEncoding(property.type)
  )
  if (lazyProperties) initializers.push("const p=i=>getProperties()[i]")
  const statements = [
    "if(i===R.missing)return R.missingExit",
    "if(o.errors===\"all\"||o.onExcessProperty!==void 0||(o.concurrency!==void 0&&o.concurrency!==1))return fallback(i,o)",
    "if(typeof i!==\"object\"||i===null||Array.isArray(i))return R.invalidType(ast,i,o)",
    lazyProperties ? "const out={}" : "const properties=getProperties(),out={}",
    "const state={ast,input:i,out,options:o,issues:void 0}",
    "let r,t,value"
  ]
  ast.propertySignatures.forEach((property, index) => {
    const key = typeof property.name === "symbol" ? `properties[${index}].name` : JSON.stringify(String(property.name))
    const present = property.name === "__proto__" ? `Object.hasOwn(i,${key})` : `${key} in i`
    const handle = `if(r===R.sameExit){if(h${index}){${assignProperty("out", key, `v${index}`, property.name)}}}else{` +
      `if(!R.effectIsExit(r))return resume(state,${index},r);` +
      `if(r._tag==="Success"&&(value=r[R.args])!==R.missing){${assignProperty("out", key, "value", property.name)}}` +
      `else{t=step(state,p${index},r);if(t)return t}}`
    const propertyPath = `ast.propertySignatures[${index}].type`
    if (canInlineEncoding(property.type)) {
      usesInlinePropertyHandler = true
      const descriptor = lazyProperties ? `p(${index})` : `p${index}`
      const handleInline = `t=handle(state,${index},${descriptor},h${index},v${index},r);if(t)return t`
      const links = property.type.encoding
      const sourceAst = links[links.length - 1].to
      const sourcePath = `${propertyPath}.encoding[${links.length - 1}].to`
      const source = inlineTypePredicate(sourceAst, `v${index}`, sourcePath)!
      const sourceChecks = sourceAst.checks !== undefined
      if (sourceChecks) initializers.push(`const s${index}=${sourcePath}`)
      const checkSource = sourceChecks ? `const c${index}=R.getCheckIssues(s${index},v${index},false,o);` : ""
      // Share cold diagnostics without adding a call to the successful path.
      if (lazyProperties && links.length === 1 && property.name !== "__proto__") {
        usesInlinePropertyFailure = true
        const transformation = links[0].transformation
        let decoded = `v${index}`
        if (transformation._tag === "Transformation" && transformation.decode._tag === "Transform") {
          const transform = bindTransform(
            transformation.decode.transform,
            `${propertyPath}.encoding[0].transformation.decode.transform`
          )
          decoded = `${transform}(v${index})`
        }
        const predicate = inlineTypePredicate(property.type, `x${index}`, propertyPath)!
        let run = `const x${index}=${decoded};` +
          `if(x${index}!==R.missing&&(${predicate})){out[${key}]=x${index}}` +
          `else{t=invalid(state,${index},h${index},v${index},x${index},o);if(t)return t}`
        if (sourceChecks) {
          usesInlineSourceFailure = true
          run = `${checkSource}if(c${index}===void 0){${run}}` +
            `else{t=invalidSource(state,${index},h${index},v${index},c${index},o);if(t)return t}`
        }
        statements.push(
          `const h${index}=${present},v${index}=h${index}?i[${key}]:R.missing`,
          `if(v${index}!==R.missing&&(${source})){${run}}` +
            `else{t=fallbackProperty(state,${index},h${index},v${index},o);if(t)return t}`
        )
        return
      }
      const fast: Array<string> = [`let x${index}=v${index};r=void 0;l${index}:{`]
      if (sourceChecks) {
        fast.push(
          `${checkSource}if(c${index}!==void 0){r=R.invalidEncodingChecks(${descriptor}.type,v${index},c${index},o);break l${index}}`
        )
      }
      for (let linkIndex = links.length - 1; linkIndex >= 0; linkIndex--) {
        const transformation = links[linkIndex].transformation
        if (transformation._tag === "Transformation" && transformation.decode._tag === "Transform") {
          const transform = bindTransform(
            transformation.decode.transform,
            `${propertyPath}.encoding[${linkIndex}].transformation.decode.transform`
          )
          fast.push(`x${index}=${transform}(x${index})`)
        }
        const targetPath = linkIndex === 0
          ? propertyPath
          : `${propertyPath}.encoding[${linkIndex - 1}].to`
        const target = linkIndex === 0 ? property.type : links[linkIndex - 1].to
        const predicate = inlineTypePredicate(target, `x${index}`, targetPath)!
        fast.push(
          `if(x${index}===R.missing){r=R.missingExit;break l${index}}else if(!(${predicate})){r=R.invalidEncoding(${descriptor}.type,${linkIndex},v${index},x${index},o);break l${index}}`
        )
      }
      fast.push(
        `};if(r!==void 0){${handleInline}}else{${assignProperty("out", key, `x${index}`, property.name)}}`
      )
      const run = `if(v${index}!==R.missing&&(${source})){${
        fast.join(";")
      }}else{r=${descriptor}.parser(v${index},o);${handleInline}}`
      statements.push(
        lazyProperties
          ? `const h${index}=${present},v${index}=h${index}?i[${key}]:R.missing`
          : `const p${index}=properties[${index}],h${index}=${present},v${index}=h${index}?i[${key}]:R.missing`,
        run
      )
    } else {
      statements.push(
        `const p${index}=properties[${index}],h${index}=${present},v${index}=h${index}?i[${key}]:R.missing`,
        `r=p${index}.parser(v${index},o)`,
        handle
      )
    }
  })
  statements.push("return R.succeed(out)")
  if (usesInlinePropertyHandler) {
    initializers.unshift(inlinePropertyHandler)
  }
  if (usesInlinePropertyFailure) {
    initializers.push(
      "const invalid=(state,index,present,input,output,o)=>{const property=p(index);return handle(state,index,property,present,input,output===R.missing?R.missingExit:R.invalidEncoding(property.type,0,input,output,o))}",
      "const fallbackProperty=(state,index,present,input,o)=>{const property=p(index);return handle(state,index,property,present,input,property.parser(input,o))}"
    )
  }
  if (usesInlineSourceFailure) {
    initializers.push(
      "const invalidSource=(state,index,present,input,issues,o)=>{const property=p(index);return handle(state,index,property,present,input,R.invalidEncodingChecks(property.type,input,issues,o))}"
    )
  }
  return `function({ast,getProperties,fallback,resume,step}){${initializers.join(";")};return function(i,o){try{${
    statements.join(";")
  }}catch(e){return R.die(e)}}}`
}
