/**
 * The TypeScript-based OpenAPI generator (`trpcdev/openapi/typescript`, 21):
 * reads a router's types with the TypeScript 7 compiler API to document
 * what the runtime generator can't see, errors that are only inferred and
 * procedures without static schemas. `typescript` is an optional peer
 * dependency, so this runs at build time.
 *
 * @example
 * ```ts
 * import { experimental_generateOpenApiFromTypes } from 'trpcdev/openapi/typescript';
 * import { appRouter } from './router.ts';
 *
 * const spec = await experimental_generateOpenApiFromTypes(appRouter, {
 *   file: new URL('./router.ts', import.meta.url),
 *   info: { title: 'API', version: '1.0.0' },
 * });
 * await fs.writeFile('openapi.json', JSON.stringify(spec, null, 2));
 * ```
 * @module
 */
import {
  API,
  SignatureKind,
  SymbolFlags,
  TypeFlags,
  type Checker,
  type Symbol as TsSymbol,
  type Type,
  type TypeReference,
} from 'typescript/unstable/sync';
import { ERROR_STATUS } from '../internal/error.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import { loadRouter } from '../server/router.ts';
import {
  generateDocument,
  type GenerateOpenApiOptions,
  type InferredTypes,
  type OpenApiDocument,
} from './generate.ts';

/**
 * The options of {@link experimental_generateOpenApiFromTypes}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface GenerateOpenApiFromTypesOptions extends GenerateOpenApiOptions {
  /** The file that exports the router: a path, relative to the working directory, or a `file:` URL. */
  file: string | URL;
  /** @default 'appRouter' */
  exportName?: string;
  /**
   * The project to type `file` with.
   * @default the nearest `tsconfig.json` that includes `file`
   */
  tsconfig?: string | URL;
}

type Schema = Record<string, unknown>;

const absolute = (path: string | URL): string => {
  if (path instanceof URL) return decodeURIComponent(path.pathname);
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return path;
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd();
  return cwd ? `${cwd}/${path.replace(/^\.\//, '')}` : path;
};

const dirname = (path: string) => path.slice(0, path.search(/[\\/][^\\/]*$/));

const has = (type: Type, flag: number) => (type.flags & flag) !== 0;

const PRIMITIVES: ReadonlyArray<[number, Schema]> = [
  [
    TypeFlags.String | TypeFlags.TemplateLiteral | TypeFlags.StringMapping,
    { type: 'string' },
  ],
  [TypeFlags.Number, { type: 'number' }],
  [TypeFlags.Boolean, { type: 'boolean' }],
  [TypeFlags.Null, { type: 'null' }],
];

const BINARY = new Set(['Blob', 'File']);
const OPAQUE = new Set([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Error',
  'RegExp',
  'Promise',
  'ReadableStream',
]);

/** Converts types to JSON Schema, as `JSON.stringify` sends them. */
class TypeToSchema {
  private readonly stack = new Set<number>();
  private readonly recursive = new Map<number, string>();
  private readonly defs: Record<string, Schema> = {};
  private readonly checker: Checker;

  constructor(checker: Checker) {
    this.checker = checker;
  }

  /** `undefined` for types JSON leaves out (`undefined`, functions, symbols). */
  root(type: Type): JsonSchema | undefined {
    const schema = this.convert(type);
    if (schema === undefined || Object.keys(this.defs).length === 0)
      return schema;
    return { ...schema, $defs: { ...this.defs } };
  }

  private nameOf(type: Type): string {
    const name = (type.getAliasSymbol() ?? type.getSymbol())?.name;
    return name && !name.startsWith('__') ? name : `Type${type.id}`;
  }

  convert(type: Type): Schema | undefined {
    if (has(type, TypeFlags.Any | TypeFlags.Unknown | TypeFlags.TypeParameter))
      return {};
    if (has(type, TypeFlags.Never)) return { not: {} };
    if (
      has(
        type,
        TypeFlags.Undefined |
          TypeFlags.Void |
          TypeFlags.BigInt |
          TypeFlags.BigIntLiteral |
          TypeFlags.ESSymbol |
          TypeFlags.UniqueESSymbol,
      )
    )
      return undefined;
    if (has(type, TypeFlags.Boolean)) return { type: 'boolean' };
    if (type.isUnionType()) return this.union(type.getTypes() ?? []);
    if (
      has(
        type,
        TypeFlags.StringLiteral |
          TypeFlags.NumberLiteral |
          TypeFlags.BooleanLiteral,
      )
    )
      return { const: (type as Type & { value: unknown }).value };
    for (const [flag, schema] of PRIMITIVES) if (has(type, flag)) return schema;
    if (type.isIntersectionType()) {
      const primitive = (type.getTypes() ?? []).find(
        (t) => !has(t, TypeFlags.Object | TypeFlags.NonPrimitive),
      );
      // Branded types (`string & { __brand }`) are their primitive.
      if (primitive) return this.convert(primitive);
    }
    if (
      has(
        type,
        TypeFlags.Object | TypeFlags.Intersection | TypeFlags.NonPrimitive,
      )
    )
      return this.object(type);
    return {};
  }

  private union(types: ReadonlyArray<Type>): Schema | undefined {
    const kept = types.filter(
      (t) => !has(t, TypeFlags.Undefined | TypeFlags.Void),
    );
    const trueAndFalse =
      kept.filter((t) => has(t, TypeFlags.BooleanLiteral)).length === 2;
    const rest = trueAndFalse
      ? kept.filter((t) => !has(t, TypeFlags.BooleanLiteral))
      : kept;
    const schemas = rest
      .map((t) => this.convert(t))
      .filter((s): s is Schema => s !== undefined);
    if (trueAndFalse) schemas.push({ type: 'boolean' });
    if (schemas.length === 0) return undefined;
    if (schemas.length === 1) return schemas[0];
    if (schemas.every((s) => 'const' in s && Object.keys(s).length === 1)) {
      return { enum: schemas.map((s) => s['const']) };
    }
    return { anyOf: schemas };
  }

  private object(type: Type): Schema | undefined {
    const checker = this.checker;
    const name = type.getSymbol()?.name;
    if (name === 'Date') return { type: 'string', format: 'date-time' };
    if (name && BINARY.has(name))
      return { type: 'string', contentMediaType: 'application/octet-stream' };
    if (name && OPAQUE.has(name)) return { type: 'object' };
    if (checker.isArrayType(type)) {
      const item = checker.getTypeArguments(type as TypeReference)[0];
      return {
        type: 'array',
        items: (item && this.convert(item)) ?? { type: 'null' },
      };
    }
    if (checker.isTupleType(type)) {
      const items = checker
        .getTypeArguments(type as TypeReference)
        .map((t) => this.convert(t) ?? { type: 'null' });
      return {
        type: 'array',
        prefixItems: items,
        minItems: items.length,
        maxItems: items.length,
      };
    }
    const properties = checker.getPropertiesOfType(type);
    if (
      properties.length === 0 &&
      checker.getSignaturesOfType(type, SignatureKind.Call).length > 0
    )
      return undefined;

    if (this.stack.has(type.id)) {
      const ref = this.nameOf(type);
      this.recursive.set(type.id, ref);
      return { $ref: `#/$defs/${ref}` };
    }
    this.stack.add(type.id);
    try {
      const toJSON = checker.getPropertyOfType(type, 'toJSON');
      if (toJSON) {
        const [signature] = checker.getSignaturesOfType(
          checker.getTypeOfSymbol(toJSON)!,
          SignatureKind.Call,
        );
        const returned =
          signature && checker.getReturnTypeOfSignature(signature);
        if (returned) return this.convert(returned);
      }
      const schema = this.members(type, properties);
      const ref = this.recursive.get(type.id);
      if (ref === undefined) return schema;
      this.defs[ref] = schema;
      return { $ref: `#/$defs/${ref}` };
    } finally {
      this.stack.delete(type.id);
    }
  }

  private members(type: Type, properties: ReadonlyArray<TsSymbol>): Schema {
    const checker = this.checker;
    const props: Record<string, Schema> = {};
    const required: string[] = [];
    for (const prop of properties) {
      if (prop.flags & SymbolFlags.Method || prop.name.startsWith('__@'))
        continue;
      const propType = checker.getTypeOfSymbol(prop);
      if (!propType) continue;
      const schema = this.convert(propType);
      if (schema === undefined) continue;
      const doc = prop.getDocumentationComment(checker);
      props[prop.name] = doc ? { ...schema, description: doc } : schema;
      const optional =
        prop.flags & SymbolFlags.Optional ||
        (propType.isUnionType() &&
          (propType.getTypes() ?? []).some((t) =>
            has(t, TypeFlags.Undefined | TypeFlags.Void),
          ));
      if (!optional) required.push(prop.name);
    }
    const schema: Schema = { type: 'object', properties: props };
    if (required.length) schema['required'] = required;
    const index = checker
      .getIndexInfosOfType(type)
      .find((i) => !has(i.keyType, TypeFlags.ESSymbol));
    if (index)
      schema['additionalProperties'] = this.convert(index.valueType) ?? {};
    return schema;
  }
}

function propertyType(
  checker: Checker,
  type: Type,
  name: string,
): Type | undefined {
  const symbol = checker.getPropertyOfType(type, name);
  const t = symbol && checker.getTypeOfSymbol(symbol);
  return t && checker.getNonNullableType(t);
}

function inferErrors(checker: Checker, errors: Type): InferredTypes['errors'] {
  const members = errors.isUnionType() ? (errors.getTypes() ?? []) : [errors];
  const found: Array<InferredTypes['errors'][number]> = [];
  for (const member of members) {
    if (has(member, TypeFlags.Never)) continue;
    const code = propertyType(checker, member, 'code');
    if (!code?.isStringLiteralType()) continue;
    const status = propertyType(checker, member, 'status');
    const data = propertyType(checker, member, 'data');
    found.push({
      code: code.value,
      status: status?.isNumberLiteralType()
        ? status.value
        : ((ERROR_STATUS as Record<string, number>)[code.value] ?? 400),
      data:
        data && !has(data, TypeFlags.Never)
          ? new TypeToSchema(checker).root(data)
          : undefined,
    });
  }
  return found;
}

function inferProcedure(checker: Checker, procedure: Type): InferredTypes {
  const def = propertyType(
    checker,
    propertyType(checker, procedure, '~trpc')!,
    '~types',
  );
  if (!def) return { errors: [] };
  const input = propertyType(checker, def, 'input');
  let output = propertyType(checker, def, 'output');
  if (output?.getSymbol()?.name === 'TrackedEnvelope') {
    output = propertyType(checker, output, 'data');
  }
  const errors = propertyType(checker, def, 'errors');
  return {
    input:
      input && !has(input, TypeFlags.Unknown | TypeFlags.Never)
        ? new TypeToSchema(checker).root(input)
        : undefined,
    output:
      output && !has(output, TypeFlags.Never)
        ? new TypeToSchema(checker).root(output)
        : undefined,
    errors: errors ? inferErrors(checker, errors) : [],
  };
}

function walk(
  checker: Checker,
  type: Type,
  prefix: string,
  out: Map<string, InferredTypes>,
): void {
  for (const prop of checker.getPropertiesOfType(type)) {
    const child = checker.getTypeOfSymbol(prop);
    if (!child) continue;
    const path = prefix ? `${prefix}.${prop.name}` : prop.name;
    if (checker.getPropertyOfType(child, '~trpc')) {
      out.set(path, inferProcedure(checker, child));
    } else if (checker.getPropertyOfType(child, '~lazy')) {
      const inner = propertyType(checker, child, '~types');
      if (inner) walk(checker, inner, path, out);
    } else if (has(child, TypeFlags.Object)) {
      walk(checker, child, path, out);
    }
  }
}

/** Reads the types of each procedure of the router `file` exports. */
function inferRouterTypes(
  opts: Pick<
    GenerateOpenApiFromTypesOptions,
    'file' | 'exportName' | 'tsconfig'
  >,
): Map<string, InferredTypes> {
  const file = absolute(opts.file);
  const tsconfig = opts.tsconfig && absolute(opts.tsconfig);
  const api = new API({ cwd: dirname(tsconfig ?? file) });
  try {
    const snapshot = api.updateSnapshot(
      tsconfig ? { openProjects: [tsconfig] } : { openFiles: [file] },
    );
    const project = snapshot.getDefaultProjectForFile(file);
    const source = project?.program.getSourceFile(file);
    if (!project || !source) {
      throw new Error(
        `experimental_generateOpenApiFromTypes: ${file} is not in a TypeScript project`,
      );
    }
    const checker = project.checker;
    const module = checker.getSymbolAtLocation(source);
    const name = opts.exportName ?? 'appRouter';
    const exported =
      module && checker.getExportsOfModule(module).find((e) => e.name === name);
    const type = exported && checker.getTypeOfSymbol(exported);
    if (!type) {
      throw new Error(
        `experimental_generateOpenApiFromTypes: ${file} doesn't export "${name}"`,
      );
    }
    const out = new Map<string, InferredTypes>();
    walk(checker, type, '', out);
    return out;
  } finally {
    api.close();
  }
}

/**
 * Generates an OpenAPI 3.1 document like `generateOpenApi`, adding what the
 * router's types state (21): errors that are only inferred (returned or
 * failed, never declared) with their status, and the input and output of
 * procedures without static schemas. Where a procedure has a runtime
 * schema, that schema wins, so the two generators agree.
 *
 * Types become JSON Schema as `JSON.stringify` sends them: `Date` is a
 * `date-time` string, `toJSON()` is followed, functions and `undefined`
 * are left out, branded primitives are their primitive, and recursive types
 * are `$ref`s into `components.schemas`.
 *
 * @example
 * ```ts
 * const spec = await experimental_generateOpenApiFromTypes(appRouter, {
 *   file: 'src/router.ts',
 *   info: { title: 'API', version: '1.0.0' },
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export async function experimental_generateOpenApiFromTypes(
  router: object,
  opts: GenerateOpenApiFromTypesOptions,
): Promise<OpenApiDocument> {
  const { file: _, exportName: __, tsconfig: ___, ...generate } = opts;
  const types = inferRouterTypes(opts);
  return generateDocument(await loadRouter(router as never), generate, (path) =>
    types.get(path),
  );
}
