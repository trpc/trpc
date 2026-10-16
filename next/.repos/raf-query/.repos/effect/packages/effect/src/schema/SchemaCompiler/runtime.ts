/**
 * Runtime helpers used by generated schema modules. This module contains no
 * source generator or dynamic function construction. Generated modules must
 * use the same Effect version as their generator.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../../Effect.ts"
import { effectIsExit, resolveConcurrency } from "../../internal/effect.ts"
import { lazyParser, type Resolve, resolve, setCompiler, withDecode } from "../../internal/schema/compilerRegistry.ts"
import * as Interpreter from "../../internal/schema/interpreter.ts"
import * as InternalParser from "../../internal/schema/parser.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaIssue from "../../SchemaIssue.ts"
import type { Compiler } from "../../SchemaParser.ts"
import { type Decode, invalid } from "../SchemaCompiler.ts"

type SchemaIssueParser = ReturnType<typeof Interpreter.compile>
type ObjectParserState = Parameters<typeof SchemaAST.stepProperty>[0]
type ParsedProperty = Parameters<typeof SchemaAST.stepProperty>[1]
type ArrayParserState = Parameters<typeof SchemaAST.stepArray>[0]
type GenerateObject = (context: {
  readonly ast: SchemaAST.Objects
  readonly getProperties: () => ReadonlyArray<ParsedProperty>
  readonly fallback: SchemaIssueParser
  readonly resume: (
    state: ObjectParserState,
    index: number,
    pending: Effect.Effect<unknown, SchemaIssue.Issue, any>
  ) => Effect.Effect<unknown, SchemaIssue.Issue, any>
  readonly step: typeof SchemaAST.stepProperty
}) => SchemaIssueParser
type GenerateArray = (context: {
  readonly getElement: () => SchemaIssueParser
  readonly step: typeof SchemaAST.stepArray
  readonly resume: (
    state: ArrayParserState,
    item: unknown,
    index: number,
    pending: Effect.Effect<unknown, SchemaIssue.Issue, any>,
    end: number
  ) => Effect.Effect<void, SchemaIssue.Issue, any>
}) => typeof SchemaAST.parseArray
const makeObjectBase = (
  ast: SchemaAST.Objects,
  compile: Compiler,
  compileField: Compiler,
  generate: GenerateObject
): SchemaIssueParser => {
  let properties: Array<ParsedProperty> | undefined
  const getProperties = (): Array<ParsedProperty> => {
    if (properties !== undefined) return properties
    const parsers = new Map<SchemaAST.AST, SchemaIssueParser>()
    return properties = ast.propertySignatures.map((property) => {
      let parser = parsers.get(property.type)
      if (parser === undefined) {
        parser = compileField(property.type)
        parsers.set(property.type, parser)
      }
      return { parser, name: property.name, type: property.type }
    })
  }
  let fallback: SchemaIssueParser | undefined
  const runFallback: SchemaIssueParser = (input, options) =>
    (fallback ??= ast.getParser(compile, compileField))(input, options)
  const resume = (
    state: ObjectParserState,
    index: number,
    pending: Effect.Effect<unknown, SchemaIssue.Issue, any>
  ): Effect.Effect<unknown, SchemaIssue.Issue, any> => {
    const property = properties![index]
    return Effect.flatMap(Effect.exit(pending), (exit) => {
      const terminal = SchemaAST.stepProperty(state, property, exit)
      if (terminal) return terminal
      const done = () => InternalParser.succeed(state.out)
      const effect = SchemaAST.parseProperties(state, properties!.slice(index + 1))
      return effect ? Effect.flatMapEager(effect, done) : done()
    })
  }
  return generate({ ast, getProperties, fallback: runFallback, resume, step: SchemaAST.stepProperty })
}

const makeArrayBase = (
  ast: SchemaAST.Arrays,
  compile: Compiler,
  compileField: Compiler,
  generate: GenerateArray
): SchemaIssueParser => {
  let element: { readonly ast: SchemaAST.AST; readonly parser: SchemaIssueParser } | undefined
  const getElement = () => (element ??= {
    ast: ast.rest[0],
    parser: compileField(ast.rest[0])
  })
  let fallback: SchemaIssueParser | undefined
  const runFallback: SchemaIssueParser = (input, options) =>
    (fallback ??= ast.getParser(compile, compileField))(input, options)
  const run = generate({
    getElement: () => getElement().parser,
    step: SchemaAST.stepArray,
    resume: (state, item, index, pending, end) =>
      Effect.flatMap(
        Effect.exit(pending),
        (exit) =>
          SchemaAST.stepArray(state, item, exit, index) ??
            SchemaAST.parseArray(state, state.input, index + 1, end) ?? Effect.void
      )
  })
  const specialized = Effect.fnUntracedEager(function*(input: unknown, options: SchemaAST.ParseOptions) {
    if (input === InternalParser.missing) return InternalParser.missing
    if (!Array.isArray(input)) {
      return yield* Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
    }
    const descriptor = getElement()
    const len = input.length
    const state: ArrayParserState = {
      ast,
      getParser: () => descriptor,
      input,
      len,
      tailThreshold: len,
      output: new globalThis.Array(len),
      issues: undefined,
      options
    }
    const effect = run(state, input, 0, len)
    if (effect) yield* effect
    if (state.issues) {
      return yield* Effect.fail(new SchemaIssue.Composite(ast, state.issues, input, options))
    }
    return state.output
  })
  return (input, options) =>
    options.concurrency !== undefined && resolveConcurrency(options.concurrency) !== 1
      ? runFallback(input, options)
      : specialized(input, options)
}

const decode = (
  ast: SchemaAST.AST,
  resolve: Resolve,
  generate?: GenerateObject,
  detailed = false,
  makeDecode?: () => Decode,
  generateArray?: GenerateArray
): SchemaIssueParser => {
  const child = (ast: SchemaAST.AST) => lazyParser(resolve, ast, detailed ? "decodeEffect" : "parser")
  const localChild = makeDecode === undefined
    ? child
    : (ast: SchemaAST.AST) => lazyParser(resolve, ast, "decodeEffect")
  const base = ast._tag === "Objects" && generate !== undefined ?
    makeObjectBase(ast, localChild, localChild, generate)
    : ast._tag === "Arrays" && generateArray !== undefined
    ? makeArrayBase(ast, localChild, localChild, generateArray)
    : makeDecode !== undefined
    ? ast.getParser(localChild)
    : undefined
  const specialize = makeDecode === undefined ? undefined : (local: SchemaIssueParser): SchemaIssueParser => {
    try {
      return withDecode(makeDecode(), () => local)
    } catch {
      // Initialization failure selects the local interpreter, without parsing again.
      return local
    }
  }
  return Interpreter.compile(ast, child, undefined, base, specialize)
}

const make = (
  ast: SchemaAST.AST,
  resolve: Resolve,
  generate?: GenerateObject,
  generateArray?: GenerateArray
): SchemaIssueParser => {
  const child = (ast: SchemaAST.AST) => lazyParser(resolve, ast, "makeEffect")
  const field = (ast: SchemaAST.AST) => Interpreter.compileField(ast, child)
  const base = generate !== undefined && ast._tag === "Objects" ?
    makeObjectBase(ast, child, field, generate)
    : generateArray !== undefined && ast._tag === "Arrays"
    ? makeArrayBase(ast, child, field, generateArray)
    : undefined
  return Interpreter.compile(ast, child, field, base)
}

const getCheckIssues = (
  ast: SchemaAST.AST,
  value: unknown,
  encoded: boolean,
  options: SchemaAST.ParseOptions
): ReturnType<typeof SchemaAST.collectIssues> => {
  const checks = encoded ? "encodingChecks" in ast ? ast.encodingChecks : undefined : ast.checks
  return !options.disableChecks && checks !== undefined
    ? SchemaAST.collectIssues(checks, value, undefined, ast, options)
    : undefined
}

const check = (
  ast: SchemaAST.AST,
  value: unknown,
  options: SchemaAST.ParseOptions
): Effect.Effect<unknown, SchemaIssue.Issue> => {
  const issues = getCheckIssues(ast, value, false, options)
  return issues === undefined
    ? InternalParser.succeed(value)
    : Effect.fail(new SchemaIssue.Composite(ast, issues, value, options))
}

const hasExcessProperties = (
  ast: SchemaAST.Objects,
  input: Record<PropertyKey, unknown>,
  indexKeys?: ReadonlyArray<ReadonlyArray<PropertyKey>>
): boolean => {
  const covered = new Set<PropertyKey>(
    ast.propertySignatures.map((p) => typeof p.name === "number" ? String(p.name) : p.name)
  )
  if (indexKeys) {
    for (const keys of indexKeys) {
      for (const key of keys) covered.add(key)
    }
  }
  return Reflect.ownKeys(input).some((key) =>
    !covered.has(key) && Object.prototype.propertyIsEnumerable.call(input, key)
  )
}

const invalidType = (ast: SchemaAST.AST, input: unknown, options: SchemaAST.ParseOptions) =>
  Effect.fail(new SchemaIssue.InvalidType(ast, input, options))

const invalidEncoding = (
  ast: SchemaAST.AST & { readonly encoding: SchemaAST.Encoding },
  index: number,
  input: unknown,
  value: unknown,
  options: SchemaAST.ParseOptions
) =>
  index === 0
    ? invalidType(ast, value, options)
    : Interpreter.wrapEncoding(ast, input, options, invalidType(ast.encoding[index - 1].to, value, options))

const invalidEncodingChecks = (
  ast: SchemaAST.AST & { readonly encoding: SchemaAST.Encoding },
  input: unknown,
  issues: readonly [SchemaIssue.Issue, ...Array<SchemaIssue.Issue>],
  options: SchemaAST.ParseOptions
) => {
  const source = ast.encoding[ast.encoding.length - 1].to
  return Interpreter.wrapEncoding(
    ast,
    input,
    options,
    Effect.fail(new SchemaIssue.Composite(source, issues, input, options))
  )
}

/**
 * @internal
 */
export const runtime = {
  decode,
  make,
  resolve,
  setCompiler,
  invalid,
  missing: InternalParser.missing,
  missingExit: InternalParser.missingExit,
  sameExit: InternalParser.sameExit,
  args: InternalParser.args,
  succeed: InternalParser.succeed,
  effectIsExit,
  die: Effect.die,
  invalidType,
  invalidEncoding,
  invalidEncodingChecks,
  getCheckIssues,
  check,
  getExpectedKeys: (ast: SchemaAST.Objects) =>
    ast.propertySignatures.map((p) => typeof p.name === "number" ? String(p.name) : p.name),
  hasExcessProperties,
  matchesTemplateLiteral: (ast: SchemaAST.TemplateLiteral, input: unknown, options: SchemaAST.ParseOptions) =>
    typeof input === "string" && ast.matchPart(input, options) !== undefined,
  getCandidateIndex: SchemaAST.getCandidateIndex,
  getIndexSignatureKeys: SchemaAST.getIndexSignatureKeys,
  parameterFromPropertyKey: SchemaAST.parameterFromPropertyKey,
  getConstructorDescriptor: SchemaAST.getConstructorDescriptor,
  defaultParseOptions: SchemaAST.defaultParseOptions
}
