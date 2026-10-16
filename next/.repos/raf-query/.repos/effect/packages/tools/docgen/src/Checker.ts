/**
 * Validates parsed documentation against the configured requirements.
 *
 * @since 0.6.0
 */
import { codeFrameColumns } from "@babel/code-frame"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Configuration from "./Configuration.ts"
import type * as Domain from "./Domain.ts"
import * as Parser from "./Parser.ts"

const makeError = (
  source: Parser.SourceShape,
  position: Domain.Position,
  message: (filePath: string, frame: string) => string
) => {
  const location = { start: position }
  const frame = codeFrameColumns(source.sourceFile.getFullText(), location)
  return [message(source.sourceFile.getFilePath(), frame)]
}

type Entry = {
  readonly doc: Domain.Doc
  readonly position: Domain.Position
}

function checkEntry(model: Entry, options: {
  readonly enforceVersion: boolean
}) {
  return Effect.gen(function*() {
    const source = yield* Parser.Source
    const config = yield* Configuration.Configuration

    let errors: Array<string> = []

    // description
    if (config.enforceDescriptions) {
      if (model.doc.description === undefined) {
        errors = errors.concat(makeError(
          source,
          model.position,
          (filePath, frame) => `Missing description in file ${filePath}:\n\n${frame}`
        ))
      }
    }

    // @example tags
    if (config.enforceExamples) {
      if (model.doc.examples.length === 0) {
        errors = errors.concat(makeError(
          source,
          model.position,
          (filePath, frame) => `Missing examples in file ${filePath}:\n\n${frame}`
        ))
      }
    }

    // @since tags
    if (config.enforceVersion && options.enforceVersion !== false) {
      const since = model.doc.since
      if (since.length === 0) {
        errors = errors.concat(makeError(
          source,
          model.position,
          (filePath, frame) => `Missing \`@since\` tag in file ${filePath}:\n\n${frame}`
        ))
      }
    }

    return errors
  })
}

function checkEntries(models: ReadonlyArray<Entry>, options: {
  readonly enforceVersion: boolean
}) {
  return Effect.forEach(models, (model) => checkEntry(model, options)).pipe(Effect.map(Array.flatten))
}

function checkFunction(model: Domain.Function) {
  return checkEntry(model, {
    enforceVersion: true
  })
}

/**
 * Validates documentation for function declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkFunctions(models: ReadonlyArray<Domain.Function>) {
  return Effect.forEach(models, checkFunction).pipe(Effect.map(Array.flatten))
}

function checkClass(model: Domain.Class) {
  return Effect.gen(function*() {
    const docErrors = yield* checkEntry(model, {
      enforceVersion: true
    })
    const staticMethodsErrors = yield* checkEntries(model.staticMethods, {
      enforceVersion: false
    })
    const methodsErrors = yield* checkEntries(model.methods, {
      enforceVersion: false
    })
    const propertiesErrors = yield* checkEntries(model.properties, {
      enforceVersion: false
    })
    return Array.flatten([docErrors, staticMethodsErrors, methodsErrors, propertiesErrors])
  })
}

/**
 * Validates documentation for class declarations and their documented members.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkClasses(models: ReadonlyArray<Domain.Class>) {
  return Effect.forEach(models, checkClass).pipe(Effect.map(Array.flatten))
}

function checkConstant(model: Domain.Constant) {
  return checkEntry(model, {
    enforceVersion: true
  })
}

/**
 * Validates documentation for constant declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkConstants(models: ReadonlyArray<Domain.Constant>) {
  return Effect.forEach(models, checkConstant).pipe(Effect.map(Array.flatten))
}

function checkInterface(model: Domain.Interface) {
  return checkEntry(model, {
    enforceVersion: true
  })
}

/**
 * Validates documentation for interface declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkInterfaces(models: ReadonlyArray<Domain.Interface>) {
  return Effect.forEach(models, checkInterface).pipe(Effect.map(Array.flatten))
}

function checkTypeAlias(model: Domain.TypeAlias) {
  return checkEntry(model, {
    enforceVersion: true
  })
}

/**
 * Validates documentation for type alias declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkTypeAliases(models: ReadonlyArray<Domain.TypeAlias>) {
  return Effect.forEach(models, checkTypeAlias).pipe(Effect.map(Array.flatten))
}

function checkNamespace(
  model: Domain.Namespace
): Effect.Effect<Array<string>, never, Parser.Source | Configuration.Configuration> {
  return Effect.gen(function*() {
    const docErrors = yield* checkEntry(model, {
      enforceVersion: true
    })
    const interfacesErrors = yield* checkInterfaces(model.interfaces)
    const typeAliasesErrors = yield* checkTypeAliases(model.typeAliases)
    const namespacesErrors = yield* checkNamespaces(model.namespaces)
    return Array.flatten([docErrors, interfacesErrors, typeAliasesErrors, namespacesErrors])
  })
}

/**
 * Validates documentation for namespaces and their nested declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkNamespaces(models: ReadonlyArray<Domain.Namespace>) {
  return Effect.forEach(models, checkNamespace).pipe(Effect.map(Array.flatten))
}

function checkExport(model: Domain.Export) {
  return checkEntry(model, {
    enforceVersion: true
  })
}

/**
 * Validates documentation for explicit export declarations.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkExports(models: ReadonlyArray<Domain.Export>) {
  return Effect.forEach(models, checkExport).pipe(Effect.map(Array.flatten))
}

/**
 * Validates every documented declaration in a parsed module.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkModule(module: Domain.Module) {
  return Effect.gen(function*() {
    const functionsErrors = yield* checkFunctions(module.functions)
    const classesErrors = yield* checkClasses(module.classes)
    const constantsErrors = yield* checkConstants(module.constants)
    const interfacesErrors = yield* checkInterfaces(module.interfaces)
    const typeAliasesErrors = yield* checkTypeAliases(module.typeAliases)
    const namespacesErrors = yield* checkNamespaces(module.namespaces)
    const exportsErrors = yield* checkExports(module.exports)
    return Array.flatten([
      functionsErrors,
      classesErrors,
      constantsErrors,
      interfacesErrors,
      typeAliasesErrors,
      namespacesErrors,
      exportsErrors
    ])
  }).pipe(Effect.provideService(Parser.Source, module.source))
}

/**
 * Validates every documented declaration in a collection of parsed modules.
 *
 * @category validation
 * @since 0.6.0
 */
export function checkModules(modules: ReadonlyArray<Domain.Module>) {
  return Effect.forEach(modules, checkModule).pipe(Effect.map(Array.flatten))
}
