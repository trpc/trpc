import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * A minimal JSON Schema subset used for OpenAPI 3.0 schemas.
 */
export interface JsonSchema {
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
// JSON Schema conversion
// ---------------------------------------------------------------------------

/** Shared state threaded through the type-to-schema recursion. */
interface SchemaCtx {
  checker: ts.TypeChecker;
  visited: Set<ts.Type>;
}

/**
 * If `type` is a branded intersection (primitive & object), return just the
 * primitive part.  Otherwise return the type as-is.
 */
function unwrapBrand(type: ts.Type): ts.Type {
  if (!type.isIntersection()) return type;
  const primitives = type.types.filter(
    (m) =>
      !!(
        m.getFlags() &
        (ts.TypeFlags.String |
          ts.TypeFlags.Number |
          ts.TypeFlags.Boolean |
          ts.TypeFlags.StringLiteral |
          ts.TypeFlags.NumberLiteral |
          ts.TypeFlags.BooleanLiteral)
      ),
  );
  const hasObject = type.types.some(
    (m) => !!(m.getFlags() & ts.TypeFlags.Object),
  );
  const [first] = primitives;
  if (first && hasObject) return first;
  return type;
}

function typeToJsonSchema(
  type: ts.Type,
  ctx: SchemaCtx,
  depth = 0,
): JsonSchema {
  if (depth > 20) return {};
  if (ctx.visited.has(type)) return {};

  const { checker } = ctx;
  const flags = type.getFlags();

  // ---- Primitive types ----
  if (flags & ts.TypeFlags.String) return { type: 'string' };
  if (flags & ts.TypeFlags.Number) return { type: 'number' };
  if (flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (flags & ts.TypeFlags.Null) return { nullable: true };
  if (flags & ts.TypeFlags.Undefined) return {};
  if (flags & ts.TypeFlags.Void) return {};
  if (flags & ts.TypeFlags.Any || flags & ts.TypeFlags.Unknown) return {};
  if (flags & ts.TypeFlags.Never) return { not: {} };
  if (flags & ts.TypeFlags.BigInt || flags & ts.TypeFlags.BigIntLiteral)
    return { type: 'integer' };

  // ---- Literal types ----
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

  // ---- Union types ----
  if (type.isUnion()) {
    const members = type.types;
    // Strip undefined / void members (they make the field optional, not typed)
    const defined = members.filter(
      (m) => !(m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
    );
    if (defined.length === 0) return {};

    const hasNull = defined.some((m) => !!(m.flags & ts.TypeFlags.Null));
    const nonNull = defined.filter(
      (m) => !(m.flags & (ts.TypeFlags.Null as number)),
    );

    // TypeScript represents `boolean` as `true | false`.  Collapse back to a
    // single `{ type: "boolean" }` instead of emitting a oneOf with two enums.
    // Also handles branded booleans where TS distributes the intersection:
    // `boolean & Brand` → `(true & Brand) | (false & Brand)`.
    if (
      nonNull.length === 2 &&
      nonNull.every(
        (m) => !!(unwrapBrand(m).getFlags() & ts.TypeFlags.BooleanLiteral),
      )
    ) {
      const result: JsonSchema = { type: 'boolean' };
      if (hasNull) result.nullable = true;
      return result;
    }

    const schemas = nonNull
      .map((m) => typeToJsonSchema(m, ctx, depth + 1))
      .filter((s) => Object.keys(s).length > 0);

    if (schemas.length === 0) return {};

    const [firstSchema] = schemas;
    const result: JsonSchema =
      schemas.length === 1 && firstSchema !== undefined
        ? firstSchema
        : { oneOf: schemas };

    if (hasNull) {
      result.nullable = true;
    }
    return result;
  }

  // ---- Intersection types ----
  if (type.isIntersection()) {
    // Branded types (e.g. z.string().brand<'X'>()) appear as an intersection of
    // a primitive with a phantom object.  A primitive & object intersection is
    // impossible at runtime, so when we see one we strip the object members —
    // they are always brand metadata.
    const hasPrimitive = type.types.some(
      (m) =>
        !!(
          m.getFlags() &
          (ts.TypeFlags.String |
            ts.TypeFlags.Number |
            ts.TypeFlags.Boolean |
            ts.TypeFlags.StringLiteral |
            ts.TypeFlags.NumberLiteral |
            ts.TypeFlags.BooleanLiteral)
        ),
    );
    const nonBrand = hasPrimitive
      ? type.types.filter((m) => !(m.getFlags() & ts.TypeFlags.Object))
      : type.types;

    const schemas = nonBrand
      .map((m) => typeToJsonSchema(m, ctx, depth + 1))
      .filter((s) => Object.keys(s).length > 0);
    if (schemas.length === 0) return {};
    const [onlySchema] = schemas;
    if (schemas.length === 1 && onlySchema !== undefined) return onlySchema;
    return { allOf: schemas };
  }

  // ---- Object types (including arrays, tuples, classes) ----
  if (flags & ts.TypeFlags.Object) {
    const sym = type.getSymbol();
    const symName = sym?.getName();

    // Well-known classes
    if (symName === 'Date') return { type: 'string', format: 'date-time' };
    if (symName === 'Uint8Array' || symName === 'Buffer')
      return { type: 'string', format: 'binary' };

    // Unwrap Promise<T>
    if (symName === 'Promise') {
      const [inner] = checker.getTypeArguments(type as ts.TypeReference);
      return inner ? typeToJsonSchema(inner, ctx, depth + 1) : {};
    }

    // Array<T>
    if (checker.isArrayType(type)) {
      const [elem] = checker.getTypeArguments(type as ts.TypeReference);
      const schema: JsonSchema = { type: 'array' };
      if (elem) schema.items = typeToJsonSchema(elem, ctx, depth + 1);
      return schema;
    }

    // Tuple — OpenAPI 3.0 does not support `prefixItems`, so we express
    // tuples as `items: oneOf[…]` with min/maxItems.
    if (checker.isTupleType(type)) {
      const args = checker.getTypeArguments(type as ts.TypeReference);
      const schemas = args.map((a) => typeToJsonSchema(a, ctx, depth + 1));
      // Deduplicate identical element schemas
      const unique = schemas.filter(
        (s, i, arr) =>
          arr.findIndex((o) => JSON.stringify(o) === JSON.stringify(s)) === i,
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

    // Regular object / interface
    ctx.visited.add(type);
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    const stringIndexType = type.getStringIndexType();
    const typeProps = type.getProperties();

    // Pure index-signature Record type (no named props)
    if (typeProps.length === 0 && stringIndexType) {
      ctx.visited.delete(type);
      return {
        type: 'object',
        additionalProperties: typeToJsonSchema(stringIndexType, ctx, depth + 1),
      };
    }

    for (const prop of typeProps) {
      const propType = checker.getTypeOfSymbol(prop);
      const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
      properties[prop.name] = typeToJsonSchema(propType, ctx, depth + 1);
      if (!isOptional) required.push(prop.name);
    }

    ctx.visited.delete(type);

    const result: JsonSchema = { type: 'object' };
    if (Object.keys(properties).length > 0) result.properties = properties;
    if (required.length > 0) result.required = required;
    if (stringIndexType) {
      result.additionalProperties = typeToJsonSchema(
        stringIndexType,
        ctx,
        depth + 1,
      );
    }
    return result;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Router / procedure type walker
// ---------------------------------------------------------------------------

/** State shared across the router-walk recursion. */
interface WalkCtx {
  checker: ts.TypeChecker;
  procedures: ProcedureInfo[];
  seen: Set<ts.Type>;
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
  if (!typeSym) return null;
  const typeType = checker.getTypeOfSymbol(typeSym);
  // checker.typeToString produces e.g. '"query"' (with quotes)
  const raw = checker.typeToString(typeType).replace(/['"]/g, '');
  if (raw === 'query' || raw === 'mutation' || raw === 'subscription')
    return raw;
  return null;
}

function walkType(type: ts.Type, ctx: WalkCtx, currentPath: string): void {
  if (ctx.seen.has(type)) return;

  const defSym = type.getProperty('_def');

  if (!defSym) {
    // No `_def` — this is a plain RouterRecord (e.g. DecorateCreateRouterOptions<…>)
    // or an unrecognised type.  Walk its own properties so nested procedures are found.
    if (type.getFlags() & ts.TypeFlags.Object) {
      ctx.seen.add(type);
      walkRecord(type, ctx, currentPath);
      ctx.seen.delete(type);
    }
    return;
  }

  const { checker } = ctx;
  const defType = checker.getTypeOfSymbol(defSym);

  // ---- Procedure? ----
  const procedureTypeName = getProcedureTypeName(defType, checker);
  if (procedureTypeName) {
    const $typesSym = defType.getProperty('$types');
    if (!$typesSym) return;
    const $typesType = checker.getTypeOfSymbol($typesSym);

    const inputSym = $typesType.getProperty('input');
    const outputSym = $typesType.getProperty('output');

    const inputType = inputSym ? checker.getTypeOfSymbol(inputSym) : null;
    const outputType = outputSym ? checker.getTypeOfSymbol(outputSym) : null;

    const inputFlags = inputType?.getFlags() ?? 0;
    const isVoidInput =
      !inputType ||
      !!(
        inputFlags &
        (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)
      ) ||
      (inputType.isUnion() &&
        inputType.types.every(
          (t) =>
            !!(t.getFlags() & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)),
        ));

    ctx.procedures.push({
      path: currentPath,
      type: procedureTypeName as 'query' | 'mutation' | 'subscription',
      inputSchema:
        isVoidInput || !inputType
          ? null
          : typeToJsonSchema(inputType, { checker, visited: new Set() }),
      outputSchema: outputType
        ? typeToJsonSchema(outputType, { checker, visited: new Set() })
        : null,
    });
    return;
  }

  // ---- Router? (_def.router === true) ----
  const routerSym = defType.getProperty('router');
  if (routerSym) {
    const routerValType = checker.getTypeOfSymbol(routerSym);
    if (checker.typeToString(routerValType) === 'true') {
      const recordSym = defType.getProperty('record');
      if (recordSym) {
        ctx.seen.add(type);
        const recordType = checker.getTypeOfSymbol(recordSym);
        walkRecord(recordType, ctx, currentPath);
        ctx.seen.delete(type);
      }
    }
  }
}

function walkRecord(recordType: ts.Type, ctx: WalkCtx, prefix: string): void {
  for (const prop of recordType.getProperties()) {
    const propType = ctx.checker.getTypeOfSymbol(prop);
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
      // Default for CommonJS / older module kinds
      options.moduleResolution = ts.ModuleResolutionKind.Node10;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// OpenAPI document builder
// ---------------------------------------------------------------------------

function buildOpenAPIDocument(
  procedures: ProcedureInfo[],
  options: GenerateOptions,
): OpenAPIDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const proc of procedures) {
    // Subscriptions map to WebSocket / SSE, not plain HTTP — skip for now
    if (proc.type === 'subscription') continue;

    // tRPC uses dot-separated paths; keep them as-is
    const opPath = `/${proc.path}`;
    const method = proc.type === 'query' ? 'get' : 'post';

    const pathItem: Record<string, unknown> = paths[opPath] ?? {};
    paths[opPath] = pathItem;

    const operation: Record<string, unknown> = {
      operationId: proc.path.replace(/\./g, '_'),
      tags: [proc.path.split('.')[0]],
      responses: {
        '200': {
          description: 'Successful response',
          ...(proc.outputSchema !== null &&
          Object.keys(proc.outputSchema).length > 0
            ? {
                content: {
                  'application/json': { schema: proc.outputSchema },
                },
              }
            : {}),
        },
        default: { $ref: '#/components/responses/error' },
      },
    };

    if (method === 'get') {
      // Query procedures: the entire input is serialised as a JSON string in
      // the `input` query parameter (matching the default tRPC HTTP transport).
      if (proc.inputSchema !== null) {
        operation['parameters'] = [
          {
            name: 'input',
            in: 'query',
            required: true,
            content: { 'application/json': { schema: proc.inputSchema } },
          },
        ];
      }
    } else {
      // Mutation procedures: input as JSON request body
      if (proc.inputSchema !== null) {
        operation['requestBody'] = {
          required: true,
          content: { 'application/json': { schema: proc.inputSchema } },
        };
      }
    }

    pathItem[method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: options.title ?? 'tRPC API',
      version: options.version ?? '0.0.0',
    },
    paths,
    components: {
      responses: {
        error: {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  code: { type: 'string' },
                  data: { type: 'object' },
                },
                required: ['message', 'code'],
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

  const walkCtx: WalkCtx = {
    checker,
    procedures: [],
    seen: new Set(),
  };
  walkType(routerType, walkCtx, '');

  return buildOpenAPIDocument(walkCtx.procedures, options);
}
