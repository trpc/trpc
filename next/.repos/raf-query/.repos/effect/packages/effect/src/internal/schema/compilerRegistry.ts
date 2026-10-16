import * as Effect from "../../Effect.ts"
import type { CompiledDecoder, Decode, Is, Make } from "../../schema/SchemaCompiler.ts"
import type * as SchemaAST from "../../SchemaAST.ts"
import type { Parser } from "../../SchemaParser.ts"
import * as Interpreter from "./interpreter.ts"
import * as InternalParser from "./parser.ts"

/** @internal */
export const invalid = Symbol()

/** @internal */
export type Resolve = (ast: SchemaAST.AST) => Entry

/** @internal */
export type DecoderSource = Partial<CompiledDecoder>

/** @internal */
export type DecoderOperation = keyof CompiledDecoder

/** @internal */
export type Compile = <K extends DecoderOperation>(
  ast: SchemaAST.AST,
  resolve: Resolve,
  operation: K
) => CompiledDecoder[K] | undefined

/** @internal */
export type CompileSource = (ast: SchemaAST.AST, resolve: Resolve) => DecoderSource | undefined

/** @internal */
export type Compiled = DecoderSource | Compile

const cache = new WeakMap<SchemaAST.AST, Entry>()
let compiler: CompileSource | undefined

/** @internal */
export let compilerAdaptersEnabled = false

function activateCompilerAdapters(): void {
  compilerAdaptersEnabled = true
}

const decodeChild = (ast: SchemaAST.AST): Parser =>
  compilerAdaptersEnabled
    ? lazyParser(resolve, ast, "parser")
    : resolve(ast).parser
const makeChild = (ast: SchemaAST.AST): Parser =>
  compilerAdaptersEnabled
    ? lazyParser(resolve, ast, "makeEffect")
    : resolve(ast).makeEffect
const makeField = (ast: SchemaAST.AST): Parser => Interpreter.compileField(ast, makeChild)

/** @internal */
export interface Entry {
  readonly ast: SchemaAST.AST
  readonly compiled?: Compiled | undefined
  readonly resolve?: Resolve | undefined
  readonly is?: Is | undefined
  readonly decode?: Decode | undefined
  readonly make?: Make | undefined
  readonly decodeEffect: Parser
  readonly parser: Parser
  readonly makeEffect: Parser
}

class InterpretedEntry implements Entry {
  readonly ast: SchemaAST.AST
  declare private cachedDecodeEffect: Parser | undefined
  declare private cachedMakeEffect: Parser | undefined

  constructor(ast: SchemaAST.AST) {
    this.ast = ast
  }

  get decodeEffect(): Parser {
    return this.cachedDecodeEffect ??= Interpreter.compile(this.ast, decodeChild)
  }

  get parser(): Parser {
    return this.decodeEffect
  }

  get makeEffect(): Parser {
    return this.cachedMakeEffect ??= Interpreter.compile(this.ast, makeChild, makeField)
  }
}

class CompilerEntry extends InterpretedEntry {
  readonly compiled: Compiled | undefined
  readonly resolve: Resolve

  constructor(ast: SchemaAST.AST, compiled: Compiled | undefined, resolve: Resolve) {
    super(ast)
    this.compiled = compiled
    this.resolve = resolve
  }

  private save<K extends keyof Entry>(key: K, value: Entry[K]): Entry[K] {
    Object.defineProperty(this, key, { value })
    return value
  }

  private operation<K extends DecoderOperation>(key: K): CompiledDecoder[K] | undefined {
    const compiled = this.compiled
    return typeof compiled === "function" ? compiled(this.ast, this.resolve, key) : compiled?.[key]
  }

  get is(): Is | undefined {
    return this.save("is", this.operation("is"))
  }

  get decode(): Decode | undefined {
    return this.save("decode", this.operation("decode"))
  }

  get make(): Make | undefined {
    return this.save("make", this.operation("make"))
  }

  override get decodeEffect(): Parser {
    return this.save(
      "decodeEffect",
      this.operation("decodeEffect") ?? Interpreter.compile(this.ast, (ast) => lazyParser(this.resolve, ast, "parser"))
    )
  }

  override get parser(): Parser {
    const decode = this.decode
    return decode === undefined
      ? this.decodeEffect
      : this.save("parser", withDecode(decode, () => this.decodeEffect))
  }

  override get makeEffect(): Parser {
    const makeEffect = this.operation("makeEffect")
    if (makeEffect !== undefined) return this.save("makeEffect", makeEffect)
    const child = (ast: SchemaAST.AST): Parser => lazyParser(this.resolve, ast, "makeEffect")
    return this.save(
      "makeEffect",
      Interpreter.compile(
        this.ast,
        child,
        (ast) => Interpreter.compileField(ast, child)
      )
    )
  }
}

/** @internal */
export function withDecode(fastDecode: Decode, decodeEffect: () => Parser): Parser {
  let detailed: Parser | undefined
  return (input, options) => {
    if (input !== InternalParser.missing) {
      try {
        const value = fastDecode(input, options)
        if (value !== invalid) return value === input ? InternalParser.sameExit : InternalParser.succeed(value)
      } catch (error) {
        return Effect.die(error)
      }
    }
    return (detailed ??= decodeEffect())(input, options)
  }
}

/** @internal */
export function lazyParser(
  resolve: Resolve,
  ast: SchemaAST.AST,
  operation: "parser" | "decodeEffect" | "makeEffect"
): Parser {
  const entry = resolve(ast)
  if (entry.compiled === undefined || Object.hasOwn(entry, operation)) {
    return entry[operation]
  }
  let parser: Parser | undefined
  return (input, options) => (parser ??= entry[operation])(input, options)
}

/** @internal */
export function resolve(ast: SchemaAST.AST): Entry {
  const cached = cache.get(ast)
  if (cached !== undefined) return cached
  const entry = compiler === undefined
    ? new InterpretedEntry(ast)
    : new CompilerEntry(ast, compiler(ast, resolve), resolve)
  cache.set(ast, entry)
  return entry
}

/** @internal */
export function set(ast: SchemaAST.AST, decoder: DecoderSource | undefined, resolveChild: Resolve = resolve): Entry {
  if (decoder !== undefined) activateCompilerAdapters()
  const entry = new CompilerEntry(ast, decoder, resolveChild)
  cache.set(ast, entry)
  return entry
}

/** @internal */
export function setCompiler(
  ast: SchemaAST.AST,
  compile: Compile,
  resolveChild: Resolve = resolve
): Entry {
  activateCompilerAdapters()
  const entry = new CompilerEntry(ast, compile, resolveChild)
  cache.set(ast, entry)
  return entry
}

/** @internal */
export function install(compile: CompileSource): void {
  activateCompilerAdapters()
  compiler = compile
}

/** @internal */
export function enable(ast: SchemaAST.AST, compile: CompileSource): void {
  activateCompilerAdapters()
  const scoped: Resolve = (child) => {
    const cached = cache.get(child)
    return cached !== undefined && (cached.compiled !== undefined || cached.resolve === scoped)
      ? cached
      : set(child, compile(child, scoped), scoped)
  }
  const decoder = compile(ast, scoped)
  const cached = cache.get(ast)
  if (decoder !== undefined || cached?.compiled === undefined) {
    set(ast, decoder, scoped)
  }
}
