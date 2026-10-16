/**
 * Generate TypeScript source for JSON Schema declarations extracted from
 * OpenAPI documents.
 *
 * This module is the schema-rendering stage of the OpenAPI generator. Callers
 * register named OpenAPI 3.0 or 3.1 schemas, provide the reusable component
 * definitions for the document, and receive source text containing exported
 * TypeScript aliases plus Effect Schema runtime values. The generator first
 * normalizes OpenAPI-specific schema shapes into Effect's JSON Schema model,
 * then delegates recursive analysis and runtime expression construction to
 * `SchemaRepresentation`.
 *
 * The renderer keeps the emitted module usable for both human maintainers and
 * automated code-generation consumers by grouping recursive declarations,
 * reusable references, and locally registered schemas. It also contains the
 * HttpApi-specific multipart file substitutions that map generated schemas to
 * Effect's multipart runtime types.
 *
 * @since 4.0.0
 */
import * as Arr from "effect/Array"
import * as JsonPointer from "effect/JsonPointer"
import * as JsonSchema from "effect/JsonSchema"
import * as Rec from "effect/Record"
import * as Schema from "effect/Schema"
import * as SchemaRepresentation from "effect/SchemaRepresentation"

type Source = "openapi-3.0" | "openapi-3.1"
interface GenerateOptions {
  readonly onEnter?: ((js: JsonSchema.JsonSchema) => JsonSchema.JsonSchema) | undefined
  readonly multipartSchemaRefs?: MultipartSchemaRefs | undefined
}

interface HttpApiMultipartSchemaRefs {
  readonly kind: "httpapi"
  readonly singleFile: string
  readonly files: string
}

type MultipartSchemaRefs = HttpApiMultipartSchemaRefs | { readonly kind: "client"; readonly singleFile: string }

/**
 * Create a stateful JSON Schema code generator for OpenAPI-derived schemas.
 *
 * **Details**
 *
 * Schemas registered with the returned generator are converted into TypeScript
 * type aliases and Effect Schema runtime declarations, with reusable OpenAPI
 * component definitions supplied at generation time.
 *
 * @category code generation
 * @since 4.0.0
 */
export function make() {
  return makeWithRepresentation()
}

function makeWithRepresentation() {
  const store = Object.create(null) as Record<string, JsonSchema.JsonSchema>

  function addSchema(name: string, schema: JsonSchema.JsonSchema): string {
    if (Object.hasOwn(store, name)) {
      throw new Error(`Schema ${name} already exists`)
    }
    store[name] = schema
    return name
  }

  function generate(
    source: Source,
    components: JsonSchema.Definitions,
    typeOnly: boolean,
    options?: GenerateOptions
  ) {
    const generated = makeCodeDocument(source, components, options)
    if (generated === undefined) {
      return ""
    }

    const nonRecursiveReferences = generated.codeDocument.references.nonRecursives
    const recursiveReferences = Object.entries(generated.codeDocument.references.recursives)

    const nonRecursives = nonRecursiveReferences.map(({ $ref, code }) =>
      renderSchemaTypeAndRuntime($ref, code, typeOnly, options)
    )

    const recursiveDeclarations: Array<string> = []
    const recursives: Array<string> = []

    if (typeOnly) {
      for (const [$ref, code] of recursiveReferences) {
        recursives.push(renderSchemaTypeAndRuntime($ref, code, true, options))
      }
    } else {
      const recursivelyForwardReferenced = collectForwardReferencedRecursives(
        nonRecursiveReferences,
        recursiveReferences
      )
      const recursiveInternalNames = makeRecursiveInternalNameMap(
        recursivelyForwardReferenced,
        [
          ...nonRecursiveReferences.map(({ $ref }) => $ref),
          ...recursiveReferences.map(([$ref]) => $ref),
          ...generated.nameMap
        ]
      )

      for (const [$ref, code] of recursiveReferences) {
        if (recursivelyForwardReferenced.has($ref)) {
          const internalName = recursiveInternalNames.get($ref)!
          recursiveDeclarations.push(renderRecursiveReferenceDeclaration($ref, code, internalName))
          recursives.push(`const ${internalName} = ${code.runtime}`)
          continue
        }

        recursives.push(renderSchemaTypeAndRuntime($ref, code, false, options))
      }
    }

    const codes = generated.codeDocument.codes.map((code, i) =>
      renderSchemaTypeAndRuntime(generated.nameMap[i], code, typeOnly, options)
    )

    return renderImportArtifacts(generated.codeDocument, !typeOnly) +
      render("recursive declarations", recursiveDeclarations) +
      render("non-recursive definitions", nonRecursives) +
      render("recursive definitions", recursives) +
      render("schemas", codes)
  }

  function generateHttpApi(
    source: Source,
    components: JsonSchema.Definitions,
    options?: GenerateOptions
  ) {
    const generated = makeCodeDocument(source, components, options)
    if (generated === undefined) {
      return ""
    }

    const nonRecursiveReferences = generated.codeDocument.references.nonRecursives
    const recursiveReferences = Object.entries(generated.codeDocument.references.recursives)

    const nonRecursives = nonRecursiveReferences.map(({ $ref, code }) =>
      renderSchemaTypeAndRuntime($ref, code, false, options)
    )

    const recursivelyForwardReferenced = collectForwardReferencedRecursives(nonRecursiveReferences, recursiveReferences)
    const recursiveInternalNames = makeRecursiveInternalNameMap(
      recursivelyForwardReferenced,
      [
        ...nonRecursiveReferences.map(({ $ref }) => $ref),
        ...recursiveReferences.map(([$ref]) => $ref),
        ...generated.nameMap
      ]
    )

    const recursiveDeclarations: Array<string> = []
    const recursives: Array<string> = []

    for (const [$ref, code] of recursiveReferences) {
      if (recursivelyForwardReferenced.has($ref)) {
        const internalName = recursiveInternalNames.get($ref)!
        recursiveDeclarations.push(renderRecursiveReferenceDeclaration($ref, code, internalName))
        recursives.push(`const ${internalName} = ${code.runtime}`)
        continue
      }

      recursives.push(renderSchemaTypeAndRuntime($ref, code, false, options))
    }

    const codes = generated.codeDocument.codes.map((code, i) =>
      renderSchemaTypeAndRuntime(generated.nameMap[i], code, false, options)
    )

    return renderImportArtifacts(generated.codeDocument, true) +
      render("recursive declarations", recursiveDeclarations) +
      render("non-recursive definitions", nonRecursives) +
      render("recursive definitions", recursives) +
      render("schemas", codes)
  }

  function makeCodeDocument(
    source: Source,
    components: JsonSchema.Definitions,
    options?: GenerateOptions
  ): {
    readonly nameMap: Array<string>
    readonly codeDocument: SchemaRepresentation.CodeDocument
  } | undefined {
    const nameMap: Array<string> = []
    const schemas: Array<JsonSchema.JsonSchema> = []

    let definitions: JsonSchema.Definitions = Rec.map(
      components,
      (js) => fromSchemaOpenApi(source, js).schema
    )

    for (const [name, js] of Object.entries(store)) {
      nameMap.push(name)
      schemas.push(fromSchemaOpenApi(source, js).schema)
    }

    if (!Arr.isArrayNonEmpty(schemas)) {
      return
    }
    if (options?.multipartSchemaRefs?.kind === "httpapi") {
      definitions = omitSupersededMultipartDefinitions(definitions, schemas, options.multipartSchemaRefs)
    }

    const document = {
      dialect: "draft-2020-12" as const,
      schemas,
      definitions
    }
    const schemasWithExamples: Array<JsonSchema.JsonSchema> = []
    const preparedSchemas = new WeakMap<JsonSchema.JsonSchema, JsonSchema.JsonSchema>()
    const preparedOutputs = new WeakSet<JsonSchema.JsonSchema>()
    const importerOptions: SchemaRepresentation.FromJsonSchemaOptions = {
      patterns: "apply",
      onEnter(js: JsonSchema.JsonSchema) {
        if (preparedOutputs.has(js)) return js
        const cached = preparedSchemas.get(js)
        if (cached !== undefined) return cached

        const out = { ...js }
        const transformed = { ...(options?.onEnter === undefined ? out : options.onEnter(out)) }
        preparedSchemas.set(js, transformed)
        preparedOutputs.add(transformed)
        if (Array.isArray(transformed.examples)) {
          schemasWithExamples.push(transformed)
        }
        return transformed
      }
    }
    let rootSchemas = SchemaRepresentation.fromJsonSchemaMultiDocument(document, importerOptions)
    if (Arr.isArrayNonEmpty(schemasWithExamples)) {
      const exampleSchemas = SchemaRepresentation.fromJsonSchemaMultiDocument(
        { ...document, schemas: schemasWithExamples },
        importerOptions
      )
      for (let i = 0; i < schemasWithExamples.length; i++) {
        const node = schemasWithExamples[i]
        const examples = node.examples as ReadonlyArray<unknown>
        const validExamples = examples.filter(Schema.is(exampleSchemas[i]))
        if (validExamples.length === examples.length) continue
        if (validExamples.length === 0) {
          delete node.examples
        } else {
          node.examples = validExamples
        }
      }
      rootSchemas = SchemaRepresentation.fromJsonSchemaMultiDocument(document, importerOptions)
    }
    const codeDocument = SchemaRepresentation.toCodeDocument(
      SchemaRepresentation.toRepresentations(Arr.map(rootSchemas, (schema) => schema.ast))
    )

    return {
      nameMap,
      codeDocument
    }
  }

  return { addSchema, generate, generateHttpApi } as const
}

function fromSchemaOpenApi(source: Source, jsonSchema: JsonSchema.JsonSchema) {
  switch (source) {
    case "openapi-3.1":
      return JsonSchema.fromSchemaOpenApi3_1(jsonSchema)
    case "openapi-3.0":
      return JsonSchema.fromSchemaOpenApi3_0(jsonSchema)
  }
}

function renderSchemaTypeAndRuntime(
  $ref: string,
  code: SchemaRepresentation.Code,
  typeOnly: boolean,
  options?: GenerateOptions
) {
  code = multipartCode($ref, options?.multipartSchemaRefs) ?? code
  const strings = [`export type ${$ref} = ${code.Type}`]
  if (!typeOnly) {
    strings.push(`export const ${$ref} = ${code.runtime}`)
  }
  return strings.join("\n")
}

function multipartCode(
  $ref: string,
  refs: MultipartSchemaRefs | undefined
): SchemaRepresentation.Code | undefined {
  if (refs === undefined) {
    return undefined
  }
  if ($ref === refs.singleFile) {
    return refs.kind === "httpapi"
      ? { Type: "Multipart.PersistedFile", runtime: "Multipart.SingleFileSchema" }
      : {
        Type: "globalThis.File | globalThis.Blob",
        runtime: `Schema.instanceOf(globalThis.Blob, { expected: "File | Blob" })`
      }
  }
  if (refs.kind === "httpapi" && $ref === refs.files) {
    return { Type: "ReadonlyArray<Multipart.PersistedFile>", runtime: "Multipart.FilesSchema" }
  }
  return undefined
}

function renderRecursiveReferenceDeclaration(
  $ref: string,
  code: SchemaRepresentation.Code,
  internalName: string
): string {
  return [
    `export type ${$ref} = ${code.Type}`,
    `export const ${$ref} = Schema.suspend((): Schema.Codec<${$ref}> => ${internalName})`
  ].join("\n")
}

function render(title: string, as: ReadonlyArray<string>) {
  if (as.length === 0) return ""
  return "// " + title + "\n" + as.join("\n") + "\n"
}

function renderImportArtifacts(codeDocument: SchemaRepresentation.CodeDocument, enabled: boolean): string {
  if (!enabled) return ""
  const imports = codeDocument.artifacts.flatMap((artifact) =>
    artifact._tag === "Import" ? [artifact.importDeclaration] : []
  )
  return imports.length === 0 ? "" : imports.join("\n") + "\n"
}

function omitSupersededMultipartDefinitions(
  definitions: JsonSchema.Definitions,
  schemas: ReadonlyArray<JsonSchema.JsonSchema>,
  multipartSchemaRefs: HttpApiMultipartSchemaRefs
): JsonSchema.Definitions {
  const rootReferences = collectReferenceKeys(schemas)
  const multipartReferences = new Set([multipartSchemaRefs.singleFile, multipartSchemaRefs.files])
  const output: JsonSchema.Definitions = {}

  for (const [key, schema] of Object.entries(definitions)) {
    const superseded = !multipartReferences.has(key) && !rootReferences.has(key) &&
      referencesAny(schema, multipartReferences)
    if (!superseded) {
      Object.defineProperty(output, key, {
        value: schema,
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
  }
  return output
}

function collectReferenceKeys(input: unknown): Set<string> {
  const references = new Set<string>()
  visitReferences(input, ($ref) => {
    const token = $ref.split("/").at(-1)
    if (token !== undefined && token.length > 0) {
      references.add(JsonPointer.unescapeToken(token))
    }
  })
  return references
}

function referencesAny(input: unknown, keys: ReadonlySet<string>): boolean {
  const references = collectReferenceKeys(input)
  for (const key of references) {
    if (keys.has(key)) return true
  }
  return false
}

function visitReferences(input: unknown, onReference: ($ref: string) => void): void {
  if (Array.isArray(input)) {
    for (const value of input) visitReferences(value, onReference)
    return
  }
  if (typeof input !== "object" || input === null) return
  for (const [key, value] of Object.entries(input)) {
    if (key === "$ref" && typeof value === "string") {
      onReference(value)
    } else {
      visitReferences(value, onReference)
    }
  }
}

const tokenPattern = /[A-Za-z_$][A-Za-z0-9_$]*/g

function collectForwardReferencedRecursives(
  nonRecursives: ReadonlyArray<{
    readonly $ref: string
    readonly code: SchemaRepresentation.Code
  }>,
  recursives: ReadonlyArray<readonly [string, SchemaRepresentation.Code]>
): Set<string> {
  const recursiveNames = new Set(recursives.map(([name]) => name))
  const recursiveIndexes = new Map(recursives.map(([name], index) => [name, index]))
  const referenced = new Set<string>()

  for (const { code } of nonRecursives) {
    for (const token of code.runtime.matchAll(tokenPattern)) {
      const identifier = token[0]
      if (recursiveNames.has(identifier)) {
        referenced.add(identifier)
      }
    }
  }

  for (let index = 0; index < recursives.length; index++) {
    const [, code] = recursives[index]
    for (const token of code.runtime.matchAll(tokenPattern)) {
      const identifier = token[0]
      const referencedIndex = recursiveIndexes.get(identifier)
      if (referencedIndex !== undefined && referencedIndex > index) {
        referenced.add(identifier)
      }
    }
  }

  return referenced
}

function makeRecursiveInternalNameMap(
  recursiveNames: ReadonlySet<string>,
  existingNames: ReadonlyArray<string>
): Map<string, string> {
  const usedNames = new Set(existingNames)
  const internalNames = new Map<string, string>()

  for (const name of recursiveNames) {
    let candidate = `__recursive_${name}`
    while (usedNames.has(candidate)) {
      candidate = `_${candidate}`
    }
    usedNames.add(candidate)
    internalNames.set(name, candidate)
  }

  return internalNames
}
