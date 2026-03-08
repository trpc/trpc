import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * A minimal JSON Schema subset used for OpenAPI 3.0 schemas.
 */
export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  enum?: (string | number | boolean | null)[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  nullable?: boolean;
  format?: string;
  description?: string;
  minItems?: number;
  maxItems?: number;
  $schema?: string;
}

interface ProcedureInfo {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
}

/** State extracted from the router's root config. */
interface RouterMeta {
  errorSchema: JsonSchema | null;
  schemas?: Record<string, JsonSchema>;
}

export interface GenerateOptions {
  /**
   * The name of the exported router symbol.
   * @default 'AppRouter'
   */
  exportName?: string;
  /** Title for the generated OpenAPI `info` object. */
  title?: string;
  /** Version string for the generated OpenAPI `info` object. */
  version?: string;
}

export interface OpenAPIDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Flag helpers
// ---------------------------------------------------------------------------

const PRIMITIVE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BooleanLiteral;

function hasFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
  return (type.getFlags() & flag) !== 0;
}

function isPrimitive(type: ts.Type): boolean {
  return hasFlag(type, PRIMITIVE_FLAGS);
}

function isObjectType(type: ts.Type): boolean {
  return hasFlag(type, ts.TypeFlags.Object);
}

function isOptionalSymbol(sym: ts.Symbol): boolean {
  return (sym.flags & ts.SymbolFlags.Optional) !== 0;
}

// ---------------------------------------------------------------------------
// JSON Schema conversion — shared state
// ---------------------------------------------------------------------------

/** Shared state threaded through the type-to-schema recursion. */
interface SchemaCtx {
  checker: ts.TypeChecker;
  visited: Set<ts.Type>;
  /** Collected named schemas for components/schemas. */
  schemas: Record<string, JsonSchema>;
  /** Map from TS type identity to its registered schema name. */
  typeToRef: Map<ts.Type, string>;
}

// ---------------------------------------------------------------------------
// Brand unwrapping
// ---------------------------------------------------------------------------

/**
 * If `type` is a branded intersection (primitive & object), return just the
 * primitive part.  Otherwise return the type as-is.
 */
function unwrapBrand(type: ts.Type): ts.Type {
  if (!type.isIntersection()) {
    return type;
  }
  const primitives = type.types.filter(isPrimitive);
  const hasObject = type.types.some(isObjectType);
  const [first] = primitives;
  if (first && hasObject) {
    return first;
  }
  return type;
}

// ---------------------------------------------------------------------------
// Schema naming helpers
// ---------------------------------------------------------------------------

const ANONYMOUS_NAMES = new Set(['__type', '__object', 'Object', '']);

/** Try to determine a meaningful name for a TS type (type alias or interface). */
function getTypeName(type: ts.Type): string | null {
  const aliasName = type.aliasSymbol?.getName();
  if (aliasName && !ANONYMOUS_NAMES.has(aliasName)) {
    return aliasName;
  }
  const symName = type.getSymbol()?.getName();
  if (symName && !ANONYMOUS_NAMES.has(symName) && !symName.startsWith('__')) {
    return symName;
  }
  return null;
}

function ensureUniqueName(
  name: string,
  existing: Record<string, unknown>,
): string {
  if (!(name in existing)) {
    return name;
  }
  let i = 2;
  while (`${name}${i}` in existing) {
    i++;
  }
  return `${name}${i}`;
}

function schemaRef(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function isNonEmptySchema(s: JsonSchema): boolean {
  for (const _ in s) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Type → JSON Schema (with component extraction)
// ---------------------------------------------------------------------------

/**
 * Convert a TS type to a JSON Schema.  If the type has been pre-registered
 * (or has a meaningful TS name), it is stored in `ctx.schemas` and a `$ref`
 * is returned instead of an inline schema.
 */
function typeToJsonSchema(
  type: ts.Type,
  ctx: SchemaCtx,
  depth = 0,
): JsonSchema {
  if (depth > 20) {
    return {};
  }

  // If this type is already registered as a named schema, return a $ref.
  const refName = ctx.typeToRef.get(type);
  if (refName) {
    if (refName in ctx.schemas) {
      return schemaRef(refName);
    }
    // First encounter: set placeholder (circular ref guard), convert, store.
    ctx.schemas[refName] = {};
    const schema = convertTypeToSchema(type, ctx, depth);
    ctx.schemas[refName] = schema;
    return schemaRef(refName);
  }

  return convertTypeToSchema(type, ctx, depth);
}

// ---------------------------------------------------------------------------
// Cyclic reference handling
// ---------------------------------------------------------------------------

/**
 * When we encounter a type we're already visiting, it's recursive.
 * Register it as a named schema and return a $ref.
 */
function handleCyclicRef(type: ts.Type, ctx: SchemaCtx): JsonSchema {
  let refName = ctx.typeToRef.get(type);
  if (!refName) {
    const name = getTypeName(type) ?? 'RecursiveType';
    refName = ensureUniqueName(name, ctx.schemas);
    ctx.typeToRef.set(type, refName);
    ctx.schemas[refName] = {}; // placeholder — filled by the outer call
  }
  return schemaRef(refName);
}

// ---------------------------------------------------------------------------
// Primitive & literal type conversion
// ---------------------------------------------------------------------------

function convertPrimitiveOrLiteral(
  type: ts.Type,
  flags: ts.TypeFlags,
  checker: ts.TypeChecker,
): JsonSchema | null {
  if (flags & ts.TypeFlags.String) {
    return { type: 'string' };
  }
  if (flags & ts.TypeFlags.Number) {
    return { type: 'number' };
  }
  if (flags & ts.TypeFlags.Boolean) {
    return { type: 'boolean' };
  }
  if (flags & ts.TypeFlags.Null) {
    return { nullable: true };
  }
  if (flags & ts.TypeFlags.Undefined) {
    return {};
  }
  if (flags & ts.TypeFlags.Void) {
    return {};
  }
  if (flags & ts.TypeFlags.Any || flags & ts.TypeFlags.Unknown) {
    return {};
  }
  if (flags & ts.TypeFlags.Never) {
    return { not: {} };
  }
  if (flags & ts.TypeFlags.BigInt || flags & ts.TypeFlags.BigIntLiteral) {
    return { type: 'integer' };
  }

  if (flags & ts.TypeFlags.StringLiteral) {
    return { type: 'string', enum: [(type as ts.StringLiteralType).value] };
  }
  if (flags & ts.TypeFlags.NumberLiteral) {
    return { type: 'number', enum: [(type as ts.NumberLiteralType).value] };
  }
  if (flags & ts.TypeFlags.BooleanLiteral) {
    const isTrue = checker.typeToString(type) === 'true';
    return { type: 'boolean', enum: [isTrue] };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Union type conversion
// ---------------------------------------------------------------------------

function convertUnionType(
  type: ts.UnionType,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  const members = type.types;

  // Strip undefined / void members (they make the field optional, not typed)
  const defined = members.filter(
    (m) => !hasFlag(m, ts.TypeFlags.Undefined | ts.TypeFlags.Void),
  );
  if (defined.length === 0) {
    return {};
  }

  const hasNull = defined.some((m) => hasFlag(m, ts.TypeFlags.Null));
  const nonNull = defined.filter((m) => !hasFlag(m, ts.TypeFlags.Null));

  // TypeScript represents `boolean` as `true | false`.  Collapse back to a
  // single `{ type: "boolean" }` instead of emitting a oneOf with two enums.
  // Also handles branded booleans: `boolean & Brand` → `(true & Brand) | (false & Brand)`.
  const isBooleanLiteralPair =
    nonNull.length === 2 &&
    nonNull.every((m) => hasFlag(unwrapBrand(m), ts.TypeFlags.BooleanLiteral));

  if (isBooleanLiteralPair) {
    const result: JsonSchema = { type: 'boolean' };
    if (hasNull) {
      result.nullable = true;
    }
    return result;
  }

  // Collapse unions of same-type literals into a single `enum` array.
  // e.g. "FOO" | "BAR" → { type: "string", enum: ["FOO", "BAR"] }
  const collapsedEnum = tryCollapseLiteralUnion(nonNull, hasNull);
  if (collapsedEnum) {
    return collapsedEnum;
  }

  const schemas = nonNull
    .map((m) => typeToJsonSchema(m, ctx, depth + 1))
    .filter(isNonEmptySchema);

  if (schemas.length === 0) {
    return {};
  }

  const [firstSchema] = schemas;
  const result: JsonSchema =
    schemas.length === 1 && firstSchema !== undefined
      ? firstSchema
      : { oneOf: schemas };

  if (hasNull) {
    // In OpenAPI 3.0 a $ref object cannot have sibling properties, so
    // wrap it in allOf when we need to add nullable.
    if (result.$ref) {
      return { allOf: [{ $ref: result.$ref }], nullable: true };
    }
    result.nullable = true;
  }
  return result;
}

/**
 * If every non-null member is a string or number literal of the same kind,
 * collapse them into a single `{ type, enum }` schema.
 */
function tryCollapseLiteralUnion(
  nonNull: ts.Type[],
  hasNull: boolean,
): JsonSchema | null {
  if (nonNull.length <= 1) {
    return null;
  }

  const allLiterals = nonNull.every((m) =>
    hasFlag(m, ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral),
  );
  if (!allLiterals) {
    return null;
  }

  const [first] = nonNull;
  if (!first) {
    return null;
  }

  const isString = hasFlag(first, ts.TypeFlags.StringLiteral);
  const targetFlag = isString
    ? ts.TypeFlags.StringLiteral
    : ts.TypeFlags.NumberLiteral;
  const allSameKind = nonNull.every((m) => hasFlag(m, targetFlag));
  if (!allSameKind) {
    return null;
  }

  const values = nonNull.map((m) =>
    isString
      ? (m as ts.StringLiteralType).value
      : (m as ts.NumberLiteralType).value,
  );
  const result: JsonSchema = {
    type: isString ? 'string' : 'number',
    enum: values,
  };
  if (hasNull) {
    result.nullable = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Intersection type conversion
// ---------------------------------------------------------------------------

function convertIntersectionType(
  type: ts.IntersectionType,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  // Branded types (e.g. z.string().brand<'X'>()) appear as an intersection of
  // a primitive with a phantom object.  Strip the object members — they are
  // always brand metadata.
  const hasPrimitiveMember = type.types.some(isPrimitive);
  const nonBrand = hasPrimitiveMember
    ? type.types.filter((m) => !isObjectType(m))
    : type.types;

  const schemas = nonBrand
    .map((m) => typeToJsonSchema(m, ctx, depth + 1))
    .filter(isNonEmptySchema);

  if (schemas.length === 0) {
    return {};
  }
  const [onlySchema] = schemas;
  if (schemas.length === 1 && onlySchema !== undefined) {
    return onlySchema;
  }
  return { allOf: schemas };
}

// ---------------------------------------------------------------------------
// Object type conversion
// ---------------------------------------------------------------------------

function convertWellKnownType(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema | null {
  const symName = type.getSymbol()?.getName();
  if (symName === 'Date') {
    return { type: 'string', format: 'date-time' };
  }
  if (symName === 'Uint8Array' || symName === 'Buffer') {
    return { type: 'string', format: 'binary' };
  }

  // Unwrap Promise<T>
  if (symName === 'Promise') {
    const [inner] = ctx.checker.getTypeArguments(type as ts.TypeReference);
    return inner ? typeToJsonSchema(inner, ctx, depth + 1) : {};
  }

  return null;
}

function convertArrayType(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  const [elem] = ctx.checker.getTypeArguments(type as ts.TypeReference);
  const schema: JsonSchema = { type: 'array' };
  if (elem) {
    schema.items = typeToJsonSchema(elem, ctx, depth + 1);
  }
  return schema;
}

function convertTupleType(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  const args = ctx.checker.getTypeArguments(type as ts.TypeReference);
  const schemas = args.map((a) => typeToJsonSchema(a, ctx, depth + 1));
  // Deduplicate identical element schemas
  const serialized = schemas.map((s) => JSON.stringify(s));
  const unique = schemas.filter(
    (_, i) => serialized.indexOf(serialized[i] ?? '') === i,
  );
  return {
    type: 'array',
    items:
      unique.length === 1 && unique[0] !== undefined
        ? unique[0]
        : { oneOf: unique },
    minItems: args.length,
    maxItems: args.length,
  };
}

function convertPlainObject(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  const { checker } = ctx;
  const stringIndexType = type.getStringIndexType();
  const typeProps = type.getProperties();

  // Pure index-signature Record type (no named props)
  if (typeProps.length === 0 && stringIndexType) {
    return {
      type: 'object',
      additionalProperties: typeToJsonSchema(stringIndexType, ctx, depth + 1),
    };
  }

  // Auto-register types with a meaningful TS name BEFORE converting
  // properties, so that circular or shared refs discovered during recursion
  // resolve to a $ref via the `typeToJsonSchema` wrapper.
  let autoRegName: string | null = null;
  const tsName = getTypeName(type);
  const isNamedUnregisteredType =
    tsName !== null && typeProps.length > 0 && !ctx.typeToRef.has(type);
  if (isNamedUnregisteredType) {
    autoRegName = ensureUniqueName(tsName, ctx.schemas);
    ctx.typeToRef.set(type, autoRegName);
    ctx.schemas[autoRegName] = {}; // placeholder for circular ref guard
  }

  ctx.visited.add(type);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of typeProps) {
    const propType = checker.getTypeOfSymbol(prop);
    properties[prop.name] = typeToJsonSchema(propType, ctx, depth + 1);
    if (!isOptionalSymbol(prop)) {
      required.push(prop.name);
    }
  }

  ctx.visited.delete(type);

  const result: JsonSchema = { type: 'object' };
  if (Object.keys(properties).length > 0) {
    result.properties = properties;
  }
  if (required.length > 0) {
    result.required = required;
  }
  if (stringIndexType) {
    result.additionalProperties = typeToJsonSchema(
      stringIndexType,
      ctx,
      depth + 1,
    );
  }

  // autoRegName covers named types (early-registered).  For anonymous
  // recursive types, a recursive call may have registered this type during
  // property conversion — check typeToRef as a fallback.
  const registeredName = autoRegName ?? ctx.typeToRef.get(type);
  if (registeredName) {
    ctx.schemas[registeredName] = result;
    return schemaRef(registeredName);
  }

  return result;
}

function convertObjectType(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  const wellKnown = convertWellKnownType(type, ctx, depth);
  if (wellKnown) {
    return wellKnown;
  }

  if (ctx.checker.isArrayType(type)) {
    return convertArrayType(type, ctx, depth);
  }
  if (ctx.checker.isTupleType(type)) {
    return convertTupleType(type, ctx, depth);
  }

  return convertPlainObject(type, ctx, depth);
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

/** Core type-to-schema conversion (no ref handling). */
function convertTypeToSchema(
  type: ts.Type,
  ctx: SchemaCtx,
  depth: number,
): JsonSchema {
  if (ctx.visited.has(type)) {
    return handleCyclicRef(type, ctx);
  }

  const flags = type.getFlags();

  const primitive = convertPrimitiveOrLiteral(type, flags, ctx.checker);
  if (primitive) {
    return primitive;
  }

  if (type.isUnion()) {
    return convertUnionType(type, ctx, depth);
  }
  if (type.isIntersection()) {
    return convertIntersectionType(type, ctx, depth);
  }
  if (isObjectType(type)) {
    return convertObjectType(type, ctx, depth);
  }

  return {};
}

// ---------------------------------------------------------------------------
// Router / procedure type walker
// ---------------------------------------------------------------------------

/** State shared across the router-walk recursion. */
interface WalkCtx {
  procedures: ProcedureInfo[];
  seen: Set<ts.Type>;
  schemaCtx: SchemaCtx;
}

/**
 * Inspect `_def.type` and return the procedure type string, or null if this is
 * not a procedure (e.g. a nested router).
 */
function getProcedureTypeName(
  defType: ts.Type,
  checker: ts.TypeChecker,
): string | null {
  const typeSym = defType.getProperty('type');
  if (!typeSym) {
    return null;
  }
  const typeType = checker.getTypeOfSymbol(typeSym);
  const raw = checker.typeToString(typeType).replace(/['"]/g, '');
  if (raw === 'query' || raw === 'mutation' || raw === 'subscription') {
    return raw;
  }
  return null;
}

function isVoidLikeInput(inputType: ts.Type | null): boolean {
  if (!inputType) {
    return true;
  }

  const isVoidOrUndefinedOrNever = hasFlag(
    inputType,
    ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never,
  );
  if (isVoidOrUndefinedOrNever) {
    return true;
  }

  const isUnionOfVoids =
    inputType.isUnion() &&
    inputType.types.every((t) =>
      hasFlag(t, ts.TypeFlags.Void | ts.TypeFlags.Undefined),
    );
  return isUnionOfVoids;
}

interface ProcedureDef {
  defType: ts.Type;
  typeName: string;
  path: string;
}

function extractProcedure(def: ProcedureDef, ctx: WalkCtx): void {
  const { schemaCtx } = ctx;
  const { checker } = schemaCtx;

  const $typesSym = def.defType.getProperty('$types');
  if (!$typesSym) {
    return;
  }
  const $typesType = checker.getTypeOfSymbol($typesSym);

  const inputSym = $typesType.getProperty('input');
  const outputSym = $typesType.getProperty('output');

  const inputType = inputSym ? checker.getTypeOfSymbol(inputSym) : null;
  const outputType = outputSym ? checker.getTypeOfSymbol(outputSym) : null;

  ctx.procedures.push({
    path: def.path,
    type: def.typeName as 'query' | 'mutation' | 'subscription',
    inputSchema:
      !inputType || isVoidLikeInput(inputType)
        ? null
        : typeToJsonSchema(inputType, schemaCtx),
    outputSchema: outputType ? typeToJsonSchema(outputType, schemaCtx) : null,
  });
}

function walkType(type: ts.Type, ctx: WalkCtx, currentPath: string): void {
  if (ctx.seen.has(type)) {
    return;
  }

  const defSym = type.getProperty('_def');

  if (!defSym) {
    // No `_def` — this is a plain RouterRecord or an unrecognised type.
    // Walk its own properties so nested procedures are found.
    if (isObjectType(type)) {
      ctx.seen.add(type);
      walkRecord(type, ctx, currentPath);
      ctx.seen.delete(type);
    }
    return;
  }

  const { checker } = ctx.schemaCtx;
  const defType = checker.getTypeOfSymbol(defSym);

  const procedureTypeName = getProcedureTypeName(defType, checker);
  if (procedureTypeName) {
    extractProcedure(
      { defType, typeName: procedureTypeName, path: currentPath },
      ctx,
    );
    return;
  }

  // Router? (_def.router === true)
  const routerSym = defType.getProperty('router');
  if (!routerSym) {
    return;
  }

  const isRouter =
    checker.typeToString(checker.getTypeOfSymbol(routerSym)) === 'true';
  if (!isRouter) {
    return;
  }

  const recordSym = defType.getProperty('record');
  if (!recordSym) {
    return;
  }

  ctx.seen.add(type);
  const recordType = checker.getTypeOfSymbol(recordSym);
  walkRecord(recordType, ctx, currentPath);
  ctx.seen.delete(type);
}

function walkRecord(recordType: ts.Type, ctx: WalkCtx, prefix: string): void {
  for (const prop of recordType.getProperties()) {
    const propType = ctx.schemaCtx.checker.getTypeOfSymbol(prop);
    const fullPath = prefix ? `${prefix}.${prop.name}` : prop.name;
    walkType(propType, ctx, fullPath);
  }
}

// ---------------------------------------------------------------------------
// TypeScript program helpers
// ---------------------------------------------------------------------------

function loadCompilerOptions(startDir: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    startDir,
    (f) => ts.sys.fileExists(f),
    'tsconfig.json',
  );
  if (!configPath) {
    return {
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      noEmit: true,
    };
  }

  const configFile = ts.readConfigFile(configPath, (f) => ts.sys.readFile(f));
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true };

  // `parseJsonConfigFileContent` only returns explicitly-set values.  TypeScript
  // itself infers moduleResolution from `module` at compile time, but we have to
  // do it manually here for the compiler host to resolve imports correctly.
  if (options.moduleResolution === undefined) {
    const mod = options.module;
    if (mod === ts.ModuleKind.Node16 || mod === ts.ModuleKind.NodeNext) {
      options.moduleResolution = ts.ModuleResolutionKind.NodeNext;
    } else if (
      mod === ts.ModuleKind.Preserve ||
      mod === ts.ModuleKind.ES2022 ||
      mod === ts.ModuleKind.ESNext
    ) {
      options.moduleResolution = ts.ModuleResolutionKind.Bundler;
    } else {
      options.moduleResolution = ts.ModuleResolutionKind.Node10;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Error shape extraction
// ---------------------------------------------------------------------------

/**
 * Walk `_def._config.$types.errorShape` on the router type and convert
 * it to a JSON Schema.  Returns `null` when the path cannot be resolved
 * (e.g. older tRPC versions or missing type info).
 */
function extractErrorSchema(
  routerType: ts.Type,
  checker: ts.TypeChecker,
  schemaCtx: SchemaCtx,
): JsonSchema | null {
  const walk = (type: ts.Type, keys: string[]): ts.Type | null => {
    const [head, ...rest] = keys;
    if (!head) {
      return type;
    }
    const sym = type.getProperty(head);
    if (!sym) {
      return null;
    }
    return walk(checker.getTypeOfSymbol(sym), rest);
  };

  const errorShapeType = walk(routerType, [
    '_def',
    '_config',
    '$types',
    'errorShape',
  ]);
  if (!errorShapeType) {
    return null;
  }

  if (hasFlag(errorShapeType, ts.TypeFlags.Any)) {
    return null;
  }

  return typeToJsonSchema(errorShapeType, schemaCtx);
}

// ---------------------------------------------------------------------------
// OpenAPI document builder
// ---------------------------------------------------------------------------

/** Fallback error schema when the router type doesn't expose an error shape. */
const DEFAULT_ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string' },
    data: { type: 'object' },
  },
  required: ['message', 'code'],
};

/**
 * Wrap a procedure's output schema in the tRPC success envelope.
 *
 * tRPC HTTP responses are always serialised as:
 *   `{ result: { data: T } }`
 *
 * When the procedure has no output the envelope is still present but
 * the `data` property is omitted.
 */
function wrapInSuccessEnvelope(outputSchema: JsonSchema | null): JsonSchema {
  const hasOutput = outputSchema !== null && isNonEmptySchema(outputSchema);
  const resultSchema: JsonSchema = {
    type: 'object',
    properties: {
      ...(hasOutput ? { data: outputSchema } : {}),
    },
    ...(hasOutput ? { required: ['data' as const] } : {}),
  };
  return {
    type: 'object',
    properties: {
      result: resultSchema,
    },
    required: ['result'],
  };
}

function buildProcedureOperation(
  proc: ProcedureInfo,
  method: 'get' | 'post',
): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: proc.path,
    tags: [proc.path.split('.')[0]],
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: wrapInSuccessEnvelope(proc.outputSchema),
          },
        },
      },
      default: { $ref: '#/components/responses/error' },
    },
  };

  if (proc.inputSchema === null) {
    return operation;
  }

  if (method === 'get') {
    operation['parameters'] = [
      {
        name: 'input',
        in: 'query',
        required: true,
        style: 'deepObject',
        content: { 'application/json': { schema: proc.inputSchema } },
      },
    ];
  } else {
    operation['requestBody'] = {
      required: true,
      content: { 'application/json': { schema: proc.inputSchema } },
    };
  }

  return operation;
}

function buildOpenAPIDocument(
  procedures: ProcedureInfo[],
  options: GenerateOptions,
  meta: RouterMeta = { errorSchema: null },
): OpenAPIDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const proc of procedures) {
    if (proc.type === 'subscription') {
      continue;
    }

    const opPath = `/${proc.path}`;
    const method = proc.type === 'query' ? 'get' : 'post';

    const pathItem: Record<string, unknown> = paths[opPath] ?? {};
    paths[opPath] = pathItem;
    pathItem[method] = buildProcedureOperation(proc, method);
  }

  const hasNamedSchemas =
    meta.schemas !== undefined && Object.keys(meta.schemas).length > 0;

  return {
    openapi: '3.1.1',
    info: {
      title: options.title ?? 'tRPC API',
      version: options.version ?? '0.0.0',
    },
    paths,
    components: {
      ...(hasNamedSchemas ? { schemas: meta.schemas } : {}),
      responses: {
        error: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: meta.errorSchema ?? DEFAULT_ERROR_SCHEMA,
                },
                required: ['error'],
              },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse the given TypeScript router file using the TypeScript compiler and
 * return an OpenAPI 3.0 document describing all query and mutation procedures.
 *
 * @param routerFilePath - Absolute or relative path to the file that exports
 *   the AppRouter.
 * @param options - Optional generation settings (export name, title, version).
 */
export function generateOpenAPIDocument(
  routerFilePath: string,
  options: GenerateOptions = {},
): OpenAPIDocument {
  const resolvedPath = path.resolve(routerFilePath);
  const exportName = options.exportName ?? 'AppRouter';

  const compilerOptions = loadCompilerOptions(path.dirname(resolvedPath));
  const program = ts.createProgram([resolvedPath], compilerOptions);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(resolvedPath);

  if (!sourceFile) {
    throw new Error(`Could not load TypeScript file: ${resolvedPath}`);
  }

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`No module exports found in: ${resolvedPath}`);
  }

  const exports = checker.getExportsOfModule(moduleSymbol);
  const routerSymbol = exports.find((sym) => sym.getName() === exportName);

  if (!routerSymbol) {
    const available = exports.map((e) => e.getName()).join(', ');
    throw new Error(
      `No export named '${exportName}' found in: ${resolvedPath}\n` +
        `Available exports: ${available || '(none)'}`,
    );
  }

  // Prefer the value declaration for value exports; fall back to the declared
  // type for `export type AppRouter = …` aliases.
  let routerType: ts.Type;
  if (routerSymbol.valueDeclaration) {
    routerType = checker.getTypeOfSymbolAtLocation(
      routerSymbol,
      routerSymbol.valueDeclaration,
    );
  } else {
    routerType = checker.getDeclaredTypeOfSymbol(routerSymbol);
  }

  const schemaCtx: SchemaCtx = {
    checker,
    visited: new Set(),
    schemas: {},
    typeToRef: new Map(),
  };

  const walkCtx: WalkCtx = {
    procedures: [],
    seen: new Set(),
    schemaCtx,
  };
  walkType(routerType, walkCtx, '');

  const errorSchema = extractErrorSchema(routerType, checker, schemaCtx);
  return buildOpenAPIDocument(walkCtx.procedures, options, {
    errorSchema,
    schemas: schemaCtx.schemas,
  });
}
