import { pathToFileURL } from 'node:url';
import type {
  AnyTRPCProcedure,
  AnyTRPCRouter,
  TRPCRouterRecord,
} from '@trpc/server';
import type {
  $ZodArrayDef,
  $ZodObjectDef,
  $ZodRegistry,
  $ZodShape,
  $ZodType,
  $ZodTypeDef,
  GlobalMeta,
} from 'zod/v4/core';
import type { JsonSchema } from './generate';

/** Description strings extracted from Zod `.describe()` calls, keyed by dot-delimited property path. */
export interface DescriptionMap {
  /** Top-level description on the schema itself (empty-string key). */
  self?: string;
  /** Property-path → description, e.g. `"name"` or `"address.street"`. */
  properties: Map<string, string>;
}

export interface RuntimeDescriptions {
  input: DescriptionMap | null;
  output: DescriptionMap | null;
}

// ---------------------------------------------------------------------------
// Zod shape walking — extract .describe() strings
// ---------------------------------------------------------------------------

/**
 * Zod v4 stores `.describe()` strings in `globalThis.__zod_globalRegistry`,
 * a WeakMap-backed `$ZodRegistry<GlobalMeta>`.  We access it via globalThis
 * because zod is an optional peer dependency.
 */
function getZodGlobalRegistry(): $ZodRegistry<GlobalMeta> | null {
  const reg = (
    globalThis as { __zod_globalRegistry?: $ZodRegistry<GlobalMeta> }
  ).__zod_globalRegistry;
  return reg && typeof reg.get === 'function' ? reg : null;
}

/** Runtime check: does this value look like a `$ZodType` (has `_zod.def`)? */
function isZodSchema(value: unknown): value is $ZodType {
  if (value == null || typeof value !== 'object') return false;
  const zod = (value as { _zod?: unknown })._zod;
  return zod != null && typeof zod === 'object' && 'def' in zod;
}

/** Get the object shape from a Zod object schema, if applicable. */
function zodObjectShape(schema: $ZodType): $ZodShape | null {
  const def = schema._zod.def;
  if (def.type === 'object' && 'shape' in def) {
    return (def as $ZodObjectDef).shape;
  }
  return null;
}

/** Get the element schema from a Zod array schema, if applicable. */
function zodArrayElement(schema: $ZodType): $ZodType | null {
  const def = schema._zod.def;
  if (def.type === 'array' && 'element' in def) {
    return (def as $ZodArrayDef).element;
  }
  return null;
}

/** Wrapper def types whose inner schema is accessible via `innerType` or `in`. */
const wrapperDefTypes: ReadonlySet<$ZodTypeDef['type']> = new Set([
  'optional',
  'nullable',
  'nonoptional',
  'default',
  'prefault',
  'catch',
  'readonly',
  'pipe',
  'transform',
  'promise',
  'lazy',
]);

/**
 * Extract the wrapped inner schema from a wrapper def.
 * Most wrappers use `innerType`; `pipe` uses `in`.
 */
function getWrappedInner(def: $ZodTypeDef): $ZodType | null {
  if ('innerType' in def) return (def as { innerType: $ZodType }).innerType;
  if ('in' in def) return (def as { in: $ZodType }).in;
  return null;
}

/** Unwrap wrapper types (optional, nullable, default, readonly, etc.) to get the inner schema. */
function unwrapZodSchema(schema: $ZodType): $ZodType {
  let current: $ZodType = schema;
  const seen = new Set<$ZodType>();
  while (!seen.has(current)) {
    seen.add(current);
    const def = current._zod.def;
    if (!wrapperDefTypes.has(def.type)) break;
    const inner = getWrappedInner(def);
    if (!inner) break;
    current = inner;
  }
  return current;
}

/**
 * Walk a Zod schema and collect description strings at each property path.
 * Returns `null` if the value is not a Zod schema or has no descriptions.
 */
export function extractZodDescriptions(schema: unknown): DescriptionMap | null {
  if (!isZodSchema(schema)) return null;
  const registry = getZodGlobalRegistry();
  if (!registry) return null;

  const map: DescriptionMap = { properties: new Map() };
  let hasAny = false;

  // Check top-level description
  const topMeta = registry.get(schema);
  if (topMeta?.description) {
    map.self = topMeta.description;
    hasAny = true;
  }

  // Walk object shape
  walkZodShape(schema, '', { registry, map });
  if (map.properties.size > 0) hasAny = true;

  return hasAny ? map : null;
}

function walkZodShape(
  schema: $ZodType,
  prefix: string,
  ctx: { registry: $ZodRegistry<GlobalMeta>; map: DescriptionMap },
): void {
  const unwrapped = unwrapZodSchema(schema);

  // If this is an array, check for a description on the element schema itself
  // (stored as `[]` in the path) and recurse into the element's shape.
  const element = zodArrayElement(unwrapped);
  if (element) {
    const unwrappedElement = unwrapZodSchema(element);
    const elemMeta = ctx.registry.get(element);
    const innerElemMeta =
      unwrappedElement !== element
        ? ctx.registry.get(unwrappedElement)
        : undefined;
    const elemDesc = elemMeta?.description ?? innerElemMeta?.description;
    if (elemDesc) {
      const itemsPath = prefix ? `${prefix}.[]` : '[]';
      ctx.map.properties.set(itemsPath, elemDesc);
    }
    walkZodShape(element, prefix, ctx);
    return;
  }

  const shape = zodObjectShape(unwrapped);
  if (!shape) return;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;

    // Check for description on the field — may be on the wrapper or inner schema
    const meta = ctx.registry.get(fieldSchema);
    const unwrappedField = unwrapZodSchema(fieldSchema);
    const innerMeta =
      unwrappedField !== fieldSchema
        ? ctx.registry.get(unwrappedField)
        : undefined;
    const description = meta?.description ?? innerMeta?.description;
    if (description) {
      ctx.map.properties.set(path, description);
    }

    // Recurse into nested objects and arrays
    walkZodShape(unwrappedField, path, ctx);
  }
}

// ---------------------------------------------------------------------------
// Router detection & dynamic import
// ---------------------------------------------------------------------------

/** Check whether a value looks like a tRPC router instance at runtime. */
function isRouterInstance(value: unknown): value is AnyTRPCRouter {
  if (value == null) return false;
  const obj = value as Record<string, unknown>;
  const def = obj['_def'];
  return (
    typeof obj === 'object' &&
    def != null &&
    typeof def === 'object' &&
    (def as Record<string, unknown>)['record'] != null &&
    typeof (def as Record<string, unknown>)['record'] === 'object'
  );
}

/**
 * Search a module's exports for a tRPC router instance.
 *
 * Tries (in order):
 * 1. Exact `exportName` match
 * 2. lcfirst variant (`AppRouter` → `appRouter`)
 * 3. First export that looks like a router
 */
export function findRouterExport(
  mod: Record<string, unknown>,
  exportName: string,
): AnyTRPCRouter | null {
  // 1. Exact match
  if (isRouterInstance(mod[exportName])) {
    return mod[exportName];
  }

  // 2. lcfirst variant (e.g. AppRouter → appRouter)
  const lcFirst = exportName.charAt(0).toLowerCase() + exportName.slice(1);
  if (lcFirst !== exportName && isRouterInstance(mod[lcFirst])) {
    return mod[lcFirst];
  }

  // 3. Any export that looks like a router
  for (const value of Object.values(mod)) {
    if (isRouterInstance(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Try to dynamically import the router file and extract a tRPC router
 * instance.  Returns `null` if the import fails (e.g. no TS loader) or
 * no router export is found.
 */
export async function tryImportRouter(
  resolvedPath: string,
  exportName: string,
): Promise<AnyTRPCRouter | null> {
  try {
    const mod = await import(pathToFileURL(resolvedPath).href);
    return findRouterExport(mod as Record<string, unknown>, exportName);
  } catch {
    // Dynamic import not available (no TS loader registered) — that's fine,
    // we fall back to type-checker-only schemas.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Router walker — collect descriptions per procedure
// ---------------------------------------------------------------------------

/**
 * Walk a runtime tRPC router/record and collect Zod `.describe()` strings
 * keyed by procedure path.
 */
export function collectRuntimeDescriptions(
  routerOrRecord: AnyTRPCRouter | TRPCRouterRecord,
  prefix: string,
  result: Map<string, RuntimeDescriptions>,
): void {
  // Unwrap router to its record; plain RouterRecords are used as-is.
  const record: TRPCRouterRecord = isRouterInstance(routerOrRecord)
    ? routerOrRecord._def.record
    : routerOrRecord;

  for (const [key, value] of Object.entries(record)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (isProcedure(value)) {
      // Procedure — extract descriptions from input and output Zod schemas
      const def = value._def;
      let inputDescs: DescriptionMap | null = null;
      for (const input of def.inputs) {
        const descs = extractZodDescriptions(input);
        if (descs) {
          // Merge multiple .input() descriptions (last wins for conflicts)
          inputDescs ??= { properties: new Map() };
          inputDescs.self = descs.self ?? inputDescs.self;
          for (const [p, d] of descs.properties) {
            inputDescs.properties.set(p, d);
          }
        }
      }

      let outputDescs: DescriptionMap | null = null;
      // `output` exists at runtime on the procedure def (from the builder)
      // but is not part of the public Procedure type.
      const outputParser = (def as Record<string, unknown>)['output'];
      if (outputParser) {
        outputDescs = extractZodDescriptions(outputParser);
      }

      if (inputDescs || outputDescs) {
        result.set(fullPath, { input: inputDescs, output: outputDescs });
      }
    } else {
      // Sub-router or nested RouterRecord — recurse
      collectRuntimeDescriptions(value, fullPath, result);
    }
  }
}

/** Type guard: check if a RouterRecord value is a procedure (callable). */
function isProcedure(
  value: AnyTRPCProcedure | TRPCRouterRecord,
): value is AnyTRPCProcedure {
  return typeof value === 'function';
}

// ---------------------------------------------------------------------------
// Apply descriptions to JSON schemas
// ---------------------------------------------------------------------------

/**
 * Overlay description strings from a `DescriptionMap` onto an existing
 * JSON schema produced by the TypeScript type checker.  Mutates in place.
 */
export function applyDescriptions(
  schema: JsonSchema,
  descs: DescriptionMap,
): void {
  if (descs.self) {
    schema.description = descs.self;
  }

  for (const [propPath, description] of descs.properties) {
    setNestedDescription(schema, propPath.split('.'), description);
  }
}

function setNestedDescription(
  schema: JsonSchema,
  pathParts: string[],
  description: string,
): void {
  if (pathParts.length === 0) return;

  const [head, ...rest] = pathParts;
  if (!head) return;

  // `[]` means "array items" — navigate to the `items` sub-schema
  if (head === '[]') {
    const items =
      schema.type === 'array' &&
      schema.items &&
      typeof schema.items === 'object'
        ? schema.items
        : null;
    if (!items) return;
    if (rest.length === 0) {
      items.description = description;
    } else {
      setNestedDescription(items, rest, description);
    }
    return;
  }

  const propSchema = schema.properties?.[head];
  if (!propSchema || typeof propSchema !== 'object') return;

  if (rest.length === 0) {
    // Leaf — Zod .describe() takes priority over JSDoc
    propSchema.description = description;
  } else {
    // For arrays, step through `items` transparently
    const target =
      propSchema.type === 'array' &&
      propSchema.items &&
      typeof propSchema.items === 'object'
        ? propSchema.items
        : propSchema;
    setNestedDescription(target, rest, description);
  }
}
