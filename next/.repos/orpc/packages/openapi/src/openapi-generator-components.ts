import type { JsonSchema, JsonSchemaConverterDirection } from '@orpc/json-schema'
import type { OpenAPIV3_2 } from './types'
import {
  decodeJsonPointerSegment,
  encodeJsonPointerSegment,
  ensureJsonSchemaObject,
  mapJsonSchemaRefs,
} from '@orpc/json-schema'
import { getOwn, isDeepEqual, isPlainObject, setOwn } from '@orpc/shared'

const DEFS_REF_PREFIX = '#/$defs/'
const COMPONENTS_REF_PREFIX = '#/components/schemas/'

/**
 * Collects reusable schemas into `doc.components.schemas`.
 *
 * Equivalent schemas (including recursive ones) reuse a single component, and different
 * schemas competing for the same name get direction-suffixed or numbered postfixes.
 */
export class OpenAPIComponentRegistry {
  constructor(
    private readonly doc: OpenAPIV3_2.OpenAPIObject,
    private readonly customComponentName: ((defName: string, defSchema: JsonSchema) => string | undefined) | undefined,
  ) {}

  /**
   * Registers `schema` as a component under `preferredName` (or an equivalent/postfixed name)
   * and returns a `$ref` to it.
   */
  register(preferredName: string, schema: Exclude<JsonSchema, boolean>): JsonSchema {
    const { $defs, ...body } = schema

    // the schema can carry its own local $defs, keep the registered name unique among them
    let defName = preferredName
    if ($defs) {
      for (let i = 2; Object.hasOwn($defs, defName); i++) {
        defName = `${preferredName}${i}`
      }
    }

    return this.hoistDefs({
      $defs: { ...$defs, [defName]: body },
      $ref: `${DEFS_REF_PREFIX}${encodeJsonPointerSegment(defName)}`,
    })
  }

  /**
   * Moves a schema's root-level `$defs` into `doc.components.schemas` and rewrites
   * its refs accordingly.
   */
  hoistDefs(schema: JsonSchema, direction?: JsonSchemaConverterDirection): JsonSchema {
    if (typeof schema !== 'object' || !schema.$defs) {
      return schema
    }

    const { $defs, ...rest } = schema
    const defs = new Map<string, Exclude<JsonSchema, boolean>>()

    for (const defName of Object.keys($defs)) {
      const defSchema = $defs[defName]

      if (defSchema !== undefined) {
        defs.set(defName, ensureJsonSchemaObject(defSchema))
      }
    }

    if (defs.size === 0) {
      return schema
    }

    this.doc.components ??= {}
    this.doc.components.schemas ??= {}

    const componentsSchemas = this.doc.components.schemas
    const renameMap = new Map<string, string>()
    const pendingSchemas: { cleanSchema: Exclude<JsonSchema, boolean>, componentName: string }[] = []

    for (const [defName, cleanSchema] of defs) {
      const [componentName, reuseExisting] = resolveComponentName(
        componentsSchemas,
        new Set(renameMap.values()),
        defName,
        this.customComponentName?.(defName, cleanSchema) ?? defName,
        defs,
        direction,
      )

      renameMap.set(defName, componentName)

      if (!reuseExisting) {
        pendingSchemas.push({ cleanSchema, componentName })
      }
    }

    for (const { cleanSchema, componentName } of pendingSchemas) {
      setOwn(componentsSchemas, componentName, rewriteComponentSchemaRefs(cleanSchema, renameMap))
    }

    return rewriteComponentSchemaRefs(rest, renameMap)
  }

  toOpenAPISchema(schema: JsonSchema, direction?: JsonSchemaConverterDirection): OpenAPIV3_2.SchemaObject {
    return ensureJsonSchemaObject(this.hoistDefs(schema, direction))
  }
}

/**
 * Walks a def's name family until it finds an equivalent existing component to reuse or
 * runs out of family members, then fills the first free mintable slot. Equal schemas under
 * unrelated names are never merged: a different name signals a different purpose.
 *
 * The family is the bare name, the direction-suffixed names when the conversion direction
 * is known, then plain numeric postfixes (`Planet`, `PlanetOutput`, `PlanetInput`,
 * `Planet2`, ...). Every member is checked for reuse, including the opposite direction,
 * but new components are only minted under the bare, own-direction, or numeric names.
 */
function resolveComponentName(
  componentsSchemas: Record<string, any>,
  claimedNames: Set<string>,
  defName: string,
  preferredName: string,
  defs: ReadonlyMap<string, JsonSchema>,
  direction: JsonSchemaConverterDirection | undefined,
): [componentName: string, reuseExisting: boolean] {
  let mintName: string | undefined

  for (let i = 1; ; i++) {
    const [componentName, mintable, tail] = componentNameCandidate(preferredName, direction, i)
    const existingSchema = getOwn(componentsSchemas, componentName)

    if (existingSchema === undefined) {
      // a sibling def can claim a slot before its schema is written, keep probing past it
      if (mintable && !claimedNames.has(componentName)) {
        mintName ??= componentName

        if (tail) {
          return [mintName, false]
        }
      }

      continue
    }

    if (areSchemaRefsEquivalentForReuse(
      DEFS_REF_PREFIX + encodeJsonPointerSegment(defName),
      COMPONENTS_REF_PREFIX + encodeJsonPointerSegment(componentName),
      { defs, componentsSchemas, candidateToExistingKeys: new Map(), pairedExistingKeys: new Set(), visited: new WeakMap() },
    )) {
      return [componentName, true]
    }
  }
}

function componentNameCandidate(
  preferredName: string,
  direction: JsonSchemaConverterDirection | undefined,
  attempt: number,
): [componentName: string, mintable: boolean, tail: boolean] {
  if (attempt === 1) {
    return [preferredName, true, false]
  }

  if (direction !== undefined) {
    if (attempt === 2) {
      return [`${preferredName}${direction === 'input' ? 'Input' : 'Output'}`, true, false]
    }

    // the opposite direction is only ever reused, never minted
    if (attempt === 3) {
      return [`${preferredName}${direction === 'input' ? 'Output' : 'Input'}`, false, false]
    }

    return [`${preferredName}${attempt - 2}`, true, true]
  }

  return [`${preferredName}${attempt}`, true, true]
}

function definedKeysOf(object: Record<string, unknown>): string[] {
  // `undefined`-valued keys (e.g. `default: undefined`) are stripped during serialization,
  // so they must not affect equivalence against components from serialized documents
  return Object.keys(object).filter(key => object[key] !== undefined).sort()
}

interface ReuseComparisonContext {
  defs: ReadonlyMap<string, JsonSchema>
  componentsSchemas: Record<string, any>
  // keys keep their ref prefix: a candidate can point at def X and component X at once
  candidateToExistingKeys: Map<string, string>
  pairedExistingKeys: Set<string>
  visited: WeakMap<object, WeakSet<object>>
}

function isSchemaContainer(value: unknown): value is unknown[] | Record<PropertyKey, unknown> {
  return Array.isArray(value) || isPlainObject(value)
}

function areSchemasEquivalentForReuse(candidate: unknown, existing: unknown, ctx: ReuseComparisonContext): boolean {
  if (candidate === existing) {
    return true
  }

  // Only arrays and plain objects carry schema structure; primitives and values like Date are compared as a whole
  if (!isSchemaContainer(candidate) || !isSchemaContainer(existing)) {
    return isDeepEqual(candidate, existing)
  }

  const seenExisting = ctx.visited.get(candidate)

  if (seenExisting?.has(existing)) {
    return true
  }

  if (seenExisting) {
    seenExisting.add(existing)
  }
  else {
    ctx.visited.set(candidate, new WeakSet([existing]))
  }

  if (Array.isArray(candidate) || Array.isArray(existing)) {
    if (!Array.isArray(candidate) || !Array.isArray(existing) || candidate.length !== existing.length) {
      return false
    }

    return candidate.every((item, index) => areSchemasEquivalentForReuse(item, existing[index], ctx))
  }

  const candidateObject = candidate as Record<string, unknown>
  const existingObject = existing as Record<string, unknown>
  const candidateKeys = definedKeysOf(candidateObject)
  const existingKeys = definedKeysOf(existingObject)

  if (!isDeepEqual(candidateKeys, existingKeys)) {
    return false
  }

  return candidateKeys.every((key) => {
    const candidateValue = candidateObject[key]
    const existingValue = existingObject[key]

    if (key === '$ref' && typeof candidateValue === 'string' && typeof existingValue === 'string') {
      return areSchemaRefsEquivalentForReuse(candidateValue, existingValue, ctx)
    }

    return areSchemasEquivalentForReuse(candidateValue, existingValue, ctx)
  })
}

function parseRefName(ref: string, prefix: string): string | undefined {
  if (!ref.startsWith(prefix)) {
    return undefined
  }

  return ref.slice(prefix.length).split('/').map(decodeJsonPointerSegment).join('/')
}

function resolveNamedRef(
  ref: string,
  prefix: string,
  getNamed: (name: string) => unknown,
): { key: string, schema: JsonSchema } | undefined {
  const name = parseRefName(ref, prefix)

  if (name === undefined) {
    return undefined
  }

  const schema = getNamed(name) as JsonSchema | undefined

  return schema === undefined ? undefined : { key: prefix + name, schema }
}

function areSchemaRefsEquivalentForReuse(candidateRef: string, existingRef: string, ctx: ReuseComparisonContext): boolean {
  const getComponent = (name: string) => getOwn(ctx.componentsSchemas, name)
  const candidate = resolveNamedRef(candidateRef, DEFS_REF_PREFIX, name => ctx.defs.get(name))
    ?? resolveNamedRef(candidateRef, COMPONENTS_REF_PREFIX, getComponent)
  const existing = resolveNamedRef(existingRef, COMPONENTS_REF_PREFIX, getComponent)

  if (candidate === undefined || existing === undefined) {
    return !candidate && !existing && candidateRef === existingRef
  }

  const pairedExisting = ctx.candidateToExistingKeys.get(candidate.key)

  if (pairedExisting !== existing.key) {
    if (pairedExisting !== undefined || ctx.pairedExistingKeys.has(existing.key)) {
      return false
    }

    ctx.candidateToExistingKeys.set(candidate.key, existing.key)
    ctx.pairedExistingKeys.add(existing.key)
  }

  return areSchemasEquivalentForReuse(candidate.schema, existing.schema, ctx)
}

function rewriteComponentSchemaRefs(schema: JsonSchema, renameMap: ReadonlyMap<string, string>): JsonSchema {
  return mapJsonSchemaRefs(schema, (ref) => {
    const refName = parseRefName(ref, DEFS_REF_PREFIX)

    if (refName === undefined) {
      return ref
    }

    const renamedName = renameMap.get(refName)

    if (renamedName === undefined) {
      return ref
    }

    return COMPONENTS_REF_PREFIX + encodeJsonPointerSegment(renamedName)
  })
}
