/**
 * Generates static JavaScript modules that install Schema decoders in the shared
 * registry. Generated modules use the same runtime support as the JIT compiler,
 * without importing source generation or constructing functions dynamically.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Codegen from "../internal/schema/codegen.ts"
import * as SchemaAST from "../SchemaAST.ts"
import type { runtime } from "./SchemaCompiler/runtime.ts"

const helper = (name: keyof typeof runtime): string => `runtime.${name}`
const decoderOperationOrder: ReadonlyArray<Codegen.DecoderOperation> = [
  "is",
  "decode",
  "make",
  "decodeEffect",
  "makeEffect"
]
const operationOrder: ReadonlyArray<Operation> = ["decode", "is", "make"]

const compiler = (sources: ReadonlyMap<Codegen.DecoderOperation, string>): string | undefined => {
  const cases = decoderOperationOrder.flatMap((key) => {
    const source = sources.get(key)
    return source === undefined ? [] : [`case ${JSON.stringify(key)}:{${source}}`]
  }).join("")
  return cases.length === 0 ? undefined : `switch(operation){${cases}}`
}

/**
 * A parser operation prepared by {@link compile}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Operation = "decode" | "is" | "make"

type PlannedOperation = Operation | "decodeEffect"

/**
 * An exact AST and the parser operations to prepare for it.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Target {
  /** The registry key installed by the generated module. */
  readonly ast: SchemaAST.AST
  /** The operations that should be compiled for this AST. */
  readonly operations: ReadonlyArray<Operation>
}

/**
 * Generates a JavaScript ES module exporting `install(asts): void` for an
 * ordered array of compilation targets.
 *
 * **When to use**
 *
 * Use to prepare decoders at build time for environments that disallow dynamic
 * function construction. Save the returned source as a JavaScript module, then
 * call its `install` export with the target ASTs in the same order before using
 * parsers. Use a one-element array for a single schema.
 *
 * **Details**
 *
 * Generation does not install decoders or execute checks and transformations.
 * Installation uses the same registry as `SchemaCompiler.set`; normal
 * `SchemaParser` functions consume those entries. Generated validators and
 * Struct and homogeneous Array loops are static functions. They share diagnostic and
 * asynchronous continuation helpers with the interpreter. A single synchronous
 * transformation between supported leaf types can use generated orchestration.
 * Other detailed traversals, transformations, and middleware use the interpreter
 * with registry-resolved children. Transformations and middleware are not replayed.
 * Only the requested operation families and their static dependencies are
 * emitted. Installation registers roots and dependencies in the same registry;
 * each generated operation initializes on first use. Missing operations retain
 * the lazy interpreter fallback. Repeated ASTs and shared dependencies are
 * installed once by identity. Fast paths can still inline dependency code into
 * multiple parent decoders. An empty array generates a module whose installation
 * does nothing.
 * Construction uses independently lazy `make` and `makeEffect` operations.
 * Pure fixed Struct and homogeneous Array constructors can use `make` for a
 * synchronous fast path; failures delegate to `makeEffect` for detailed issues.
 * Tuple, Record, Union, leaf, and Class constructors use the existing
 * interpreter. Constructor defaults and Class source schemas are read from the
 * supplied ASTs, not serialized or executed during generation. `make` is
 * omitted whenever replay could repeat observable construction work.
 *
 * **Gotchas**
 *
 * Regenerate the module whenever the schema definition or Effect version
 * changes. Installation trusts that the runtime array has the same length and
 * target order, and its ASTs have the same definitions and sharing as at build
 * time. Functions and symbols are read from those ASTs, not serialized.
 * Suspend thunks are not evaluated during generation; their contents and other
 * unsupported nodes use the interpreter.
 * Installation replaces generated entries, but parsers that already captured
 * older entries keep them. Type-side and flipped ASTs are separate registry
 * keys; generate and install them separately when needed. Importing the
 * generated module alone does not install anything.
 * In particular, target `SchemaAST.toType(schema.ast)` with `make` to prepare
 * construction when it differs from the encoded root. Target
 * `SchemaAST.flip(schema.ast)` with `decode` to prepare encoding. Unsupported
 * operations use the interpreter while statically installed children remain
 * available.
 *
 * @stability unstable
 * @category compilation
 * @since 4.0.0
 */
export const compile = (targets: ReadonlyArray<Target>): string => {
  interface PlannedNode {
    readonly index: number
    readonly name: string
    readonly reference: string
    readonly requested: Set<PlannedOperation>
    readonly sources: Map<Codegen.DecoderOperation, string>
    readonly attempted: Set<Codegen.DecoderOperation>
    readonly compilable: boolean
  }

  const seen = new Map<SchemaAST.AST, PlannedNode>()
  const bindings: Array<string> = []
  const factories: Array<string> = []
  const factoryNames = new Map<string, string>()
  const installations: Array<string> = []

  const addSource = (node: SchemaAST.AST, plan: PlannedNode, operation: Codegen.DecoderOperation): boolean => {
    if (plan.attempted.has(operation)) return plan.sources.has(operation)
    plan.attempted.add(operation)
    if (!plan.compilable) return false
    const source = Codegen.generate(node, operation)
    if (source === undefined) return false
    plan.sources.set(operation, source)
    return true
  }

  const visitDependencies = (node: SchemaAST.AST, name: string, operation: PlannedOperation): void => {
    switch (node._tag) {
      case "Declaration":
        node.typeParameters.forEach((child, index) => visit(child, `${name}.typeParameters[${index}]`, operation))
        break
      case "TemplateLiteral":
        node.parts.forEach((child, index) => visit(child, `${name}.parts[${index}]`, operation))
        break
      case "Arrays":
        node.elements.forEach((child, index) => visit(child, `${name}.elements[${index}]`, operation))
        node.rest.forEach((child, index) => visit(child, `${name}.rest[${index}]`, operation))
        break
      case "Objects":
        node.propertySignatures.forEach((property, index) =>
          visit(property.type, `${name}.propertySignatures[${index}].type`, operation)
        )
        node.indexSignatures.forEach((signature, index) => {
          visit(
            SchemaAST.parameterFromPropertyKey(signature.parameter),
            `${helper("parameterFromPropertyKey")}(${name}.indexSignatures[${index}].parameter)`,
            operation
          )
          visit(signature.type, `${name}.indexSignatures[${index}].type`, operation)
        })
        break
      case "Union":
        node.types.forEach((child, index) => visit(child, `${name}.types[${index}]`, operation))
        break
    }
    node.encoding?.forEach((link, index) => visit(link.to, `${name}.encoding[${index}].to`, operation))
    if (operation === "make") {
      const descriptor = SchemaAST.getConstructorDescriptor(node)
      if (descriptor !== undefined) {
        visit(descriptor.link.to, `${helper("getConstructorDescriptor")}(${name}).link.to`, operation)
      }
    }
  }

  function visit(node: SchemaAST.AST, reference: string, operation: PlannedOperation): void {
    let plan = seen.get(node)
    if (plan === undefined) {
      const index = seen.size
      plan = {
        index,
        name: `a${index}`,
        reference,
        requested: new Set(),
        sources: new Map(),
        attempted: new Set(),
        compilable: Codegen.shouldCompileParser(node)
      }
      seen.set(node, plan)
    }
    if (plan.requested.has(operation)) return
    plan.requested.add(operation)

    switch (operation) {
      case "decode":
        addSource(node, plan, "decode")
        visit(node, reference, "decodeEffect")
        break
      case "decodeEffect":
        addSource(node, plan, "decodeEffect")
        visitDependencies(node, plan.name, operation)
        break
      case "is":
        if (!addSource(node, plan, "is")) visit(node, reference, "decode")
        break
      case "make":
        addSource(node, plan, "make")
        addSource(node, plan, "makeEffect")
        visitDependencies(node, plan.name, operation)
        break
    }
  }

  targets.forEach((target, index) => {
    for (const operation of operationOrder) {
      if (target.operations.includes(operation)) visit(target.ast, `asts[${index}]`, operation)
    }
  })
  for (const plan of seen.values()) {
    bindings.push(`const ${plan.name}=${plan.reference};`)
    const source = compiler(plan.sources)
    if (source !== undefined) {
      let factory = factoryNames.get(source)
      if (factory === undefined) {
        factory = `d${factoryNames.size}`
        factoryNames.set(source, factory)
        factories.push(`function ${factory}(ast,resolve,operation){const R=runtime;${source}}`)
      }
      installations.push(`${helper("setCompiler")}(${plan.name},${factory});`)
    }
  }
  return [
    "// Generated by SchemaAOTCompiler. Regenerate after schema or Effect changes.",
    "import { runtime } from \"effect/schema/SchemaCompiler/runtime\";",
    ...factories,
    "/** @param {ReadonlyArray<import(\"effect/SchemaAST\").AST>} asts */",
    "export function install(asts){",
    ...bindings,
    ...installations,
    "}",
    ""
  ].join("\n")
}
