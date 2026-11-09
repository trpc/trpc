/**
 * Data models shared by the docgen parser, checker, and printer.
 *
 * @since 0.6.0
 */

import type * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Rec from "effect/Record"
import * as String from "effect/String"
import type * as Parser from "./Parser.ts"

/**
 * Base model for a named, documented declaration.
 *
 * @category models
 * @since 0.6.0
 */
export class DocEntry {
  readonly name: string
  readonly doc: Doc
  readonly signature: string
  readonly position: Position
  constructor(
    name: string,
    doc: Doc,
    signature: string,
    position: Position
  ) {
    this.name = name
    this.doc = doc
    this.signature = signature
    this.position = position
  }
}

/**
 * Parsed JSDoc content attached to a declaration or module.
 *
 * @category models
 * @since 0.6.0
 */
export class Doc {
  readonly description: string | undefined
  readonly since: ReadonlyArray<string>
  readonly deprecated: ReadonlyArray<string>
  readonly examples: ReadonlyArray<string>
  readonly category: ReadonlyArray<string>
  readonly throws: ReadonlyArray<string>
  readonly sees: ReadonlyArray<string>
  readonly tags: Record<string, ReadonlyArray<string> | undefined>
  constructor(
    description: string | undefined,
    since: ReadonlyArray<string>,
    deprecated: ReadonlyArray<string>,
    examples: ReadonlyArray<string>,
    category: ReadonlyArray<string>,
    throws: ReadonlyArray<string>,
    sees: ReadonlyArray<string>,
    tags: Record<string, ReadonlyArray<string> | undefined>
  ) {
    this.description = description
    this.since = since
    this.deprecated = deprecated
    this.examples = examples
    this.category = category
    this.throws = throws
    this.sees = sees
    this.tags = tags
  }

  modifyDescription(description: string | undefined): Doc {
    return new Doc(
      description,
      this.since,
      this.deprecated,
      this.examples,
      this.category,
      this.throws,
      this.sees,
      this.tags
    )
  }
}

/**
 * Parsed documentation model for one source module.
 *
 * @category models
 * @since 0.6.0
 */
export class Module {
  readonly source: Parser.SourceShape
  readonly name: string
  readonly doc: Doc
  readonly path: Array.NonEmptyReadonlyArray<string>
  readonly classes: ReadonlyArray<Class>
  readonly interfaces: ReadonlyArray<Interface>
  readonly functions: ReadonlyArray<Function>
  readonly typeAliases: ReadonlyArray<TypeAlias>
  readonly constants: ReadonlyArray<Constant>
  readonly exports: ReadonlyArray<Export>
  readonly namespaces: ReadonlyArray<Namespace>
  constructor(
    source: Parser.SourceShape,
    name: string,
    doc: Doc,
    path: Array.NonEmptyReadonlyArray<string>,
    classes: ReadonlyArray<Class>,
    interfaces: ReadonlyArray<Interface>,
    functions: ReadonlyArray<Function>,
    typeAliases: ReadonlyArray<TypeAlias>,
    constants: ReadonlyArray<Constant>,
    exports: ReadonlyArray<Export>,
    namespaces: ReadonlyArray<Namespace>
  ) {
    this.source = source
    this.name = name
    this.doc = doc
    this.path = path
    this.classes = classes
    this.interfaces = interfaces
    this.functions = functions
    this.typeAliases = typeAliases
    this.constants = constants
    this.exports = exports
    this.namespaces = namespaces
  }
}

/**
 * Parsed documentation model for a class and its documented members.
 *
 * @category models
 * @since 0.6.0
 */
export class Class extends DocEntry {
  readonly _tag = "Class"
  readonly methods: ReadonlyArray<DocEntry>
  readonly staticMethods: ReadonlyArray<DocEntry>
  readonly properties: ReadonlyArray<DocEntry>
  constructor(
    name: string,
    doc: Doc,
    signature: string,
    position: Position,
    methods: ReadonlyArray<DocEntry>,
    staticMethods: ReadonlyArray<DocEntry>,
    properties: ReadonlyArray<DocEntry>
  ) {
    super(name, doc, signature, position)
    this.methods = methods
    this.staticMethods = staticMethods
    this.properties = properties
  }
}

/**
 * Parsed documentation model for an interface.
 *
 * @category models
 * @since 0.6.0
 */
export class Interface extends DocEntry {
  readonly _tag = "Interface"
}

/**
 * One-based source position used in diagnostics.
 *
 * @category models
 * @since 0.6.0
 */
export interface Position {
  readonly line: number
  readonly column: number
}

/**
 * Parsed documentation model for a function.
 *
 * @category models
 * @since 0.6.0
 */
export class Function extends DocEntry {
  readonly _tag = "Function"
}

/**
 * Parsed documentation model for a type alias.
 *
 * @category models
 * @since 0.6.0
 */
export class TypeAlias extends DocEntry {
  readonly _tag = "TypeAlias"
}

/**
 * Parsed documentation model for a constant.
 *
 * @category models
 * @since 0.6.0
 */
export class Constant extends DocEntry {
  readonly _tag = "Constant"
}

/**
 * Parsed documentation model for an explicit named or namespace export.
 *
 * @category models
 * @since 0.6.0
 */
export class Export extends DocEntry {
  readonly _tag = "Export"
  readonly isNamespaceExport: boolean
  constructor(
    name: string,
    doc: Doc,
    signature: string,
    position: Position,
    isNamespaceExport: boolean
  ) {
    super(name, doc, signature, position)
    this.isNamespaceExport = isNamespaceExport
  }
}

/**
 * Parsed documentation model for a namespace and its nested declarations.
 *
 * @category models
 * @since 0.6.0
 */
export class Namespace {
  readonly _tag = "Namespace"
  readonly name: string
  readonly doc: Doc
  readonly position: Position
  readonly interfaces: ReadonlyArray<Interface>
  readonly typeAliases: ReadonlyArray<TypeAlias>
  readonly namespaces: ReadonlyArray<Namespace>
  constructor(
    name: string,
    doc: Doc,
    position: Position,
    interfaces: ReadonlyArray<Interface>,
    typeAliases: ReadonlyArray<TypeAlias>,
    namespaces: ReadonlyArray<Namespace>
  ) {
    this.name = name
    this.doc = doc
    this.position = position
    this.interfaces = interfaces
    this.typeAliases = typeAliases
    this.namespaces = namespaces
  }
}

/**
 * A comparator function for sorting `Module` objects by their file path, represented as a string.
 * The file path is converted to lowercase before comparison.
 *
 * @category sorting
 * @since 0.6.0
 */
export const ByPath: Order.Order<Module> = Order.mapInput(
  String.Order,
  (module: Module) => module.path.join("/").toLowerCase()
)

/**
 * Represents a file which can be optionally overwriteable.
 *
 * @category models
 * @since 0.6.0
 */
export class File {
  readonly path: string
  readonly content: string
  readonly isOverwriteable: boolean
  constructor(
    path: string,
    content: string,
    isOverwriteable: boolean = false
  ) {
    this.path = path
    this.content = content
    this.isOverwriteable = isOverwriteable
  }
}

/**
 * Type ID for `DocgenError`.
 *
 * @category symbols
 * @since 0.6.0
 */
export const DocgenErrorTypeId = Symbol.for("@effect/docgen/DocgenError")

/**
 * Type-level representation of `DocgenErrorTypeId`.
 *
 * @category symbols
 * @since 0.6.0
 */
export type DocgenErrorTypeId = typeof DocgenErrorTypeId

/**
 * Error reported when documentation generation cannot continue.
 *
 * @category errors
 * @since 0.6.0
 */
export class DocgenError extends Data.TaggedError("DocgenError")<{
  readonly message: string
}> {}

/**
 * Represents a handle to the currently executing process.
 *
 * @category services
 * @since 0.6.0
 */
export class Process extends Context.Service<Process, {
  readonly cwd: Effect.Effect<string>
  readonly platform: Effect.Effect<NodeJS.Platform>
  readonly argv: Effect.Effect<Array<string>>
  readonly env: Effect.Effect<Record<string, string>>
}>()("@effect/docgen/Process") {
  static readonly layer = Layer.succeed(Process, {
    cwd: Effect.sync(() => process.cwd()),
    platform: Effect.sync(() => process.platform),
    argv: Effect.sync(() => process.argv),
    env: Effect.sync(() => {
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) Rec.assignProperty(env, key, value)
      }
      return env
    })
  })
}
