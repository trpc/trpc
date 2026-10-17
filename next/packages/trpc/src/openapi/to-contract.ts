import { JsonSchema, Predicate, SchemaRepresentation } from 'effect';

/**
 * An OpenAPI 3.0 or 3.1 document, as {@link generateContractFromOpenApi}
 * reads it.
 * @since 0.1.0
 * @stability stable
 */
export interface OpenApiSource {
  readonly openapi: string;
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: {
    readonly schemas?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Options for {@link generateContractFromOpenApi}.
 * @since 0.1.0
 * @stability stable
 */
export interface GenerateContractOptions {
  /**
   * Stripped from each path, as `openApiLink`'s `prefix` adds it back.
   * @default ''
   */
  readonly prefix?: string;
  /** @default 'contract' */
  readonly exportName?: string;
  /**
   * JSON Schema `pattern`s: `'apply'` checks them (trusted documents only),
   * `'ignore'` drops them. @default 'ignore'
   */
  readonly patterns?: 'apply' | 'ignore';
}

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

interface Parameter {
  readonly name: string;
  readonly in: string;
  readonly required?: boolean;
  readonly schema?: JsonSchema.JsonSchema;
}

interface Operation {
  readonly operationId?: string;
  readonly parameters?: ReadonlyArray<Parameter | { $ref: string }>;
  readonly requestBody?: {
    readonly content?: Readonly<
      Record<string, { readonly schema?: JsonSchema.JsonSchema }>
    >;
  };
  readonly responses?: Readonly<
    Record<
      string,
      {
        readonly content?: Readonly<
          Record<string, { readonly schema?: JsonSchema.JsonSchema }>
        >;
      }
    >
  >;
}

interface Leaf {
  readonly path: ReadonlyArray<string>;
  readonly name: string;
  readonly type: 'query' | 'mutation' | 'subscription';
  readonly method: string;
  readonly route: string;
  readonly successStatus: number;
  readonly input: string | undefined;
  readonly output: string | undefined;
  readonly errors: ReadonlyArray<{
    readonly code: string;
    readonly status: number;
    readonly data: string | undefined;
  }>;
}

const pascal = (parts: ReadonlyArray<string>) =>
  parts
    .flatMap((p) => p.split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');

const camel = (parts: ReadonlyArray<string>) => {
  const name = pascal(parts);
  return name[0]!.toLowerCase() + name.slice(1);
};

const isIdentifier = (key: string) => /^[A-Za-z_$][\w$]*$/.test(key);
const key = (k: string) => (isIdentifier(k) ? k : JSON.stringify(k));

const jsonBody = (
  content:
    | Readonly<Record<string, { readonly schema?: JsonSchema.JsonSchema }>>
    | undefined,
): JsonSchema.JsonSchema | undefined =>
  content?.['application/json']?.schema ??
  content?.['multipart/form-data']?.schema ??
  content?.['application/x-www-form-urlencoded']?.schema;

const isObjectSchema = (s: JsonSchema.JsonSchema) =>
  s['type'] === 'object' && s['properties'] !== undefined;

function inputSchema(
  op: Operation,
  route: string,
): JsonSchema.JsonSchema | undefined {
  const params = (op.parameters ?? []).filter(
    (p): p is Parameter => 'name' in p && (p.in === 'path' || p.in === 'query'),
  );
  const body = jsonBody(op.requestBody?.content);
  if (params.length === 0) return body;
  const properties: Record<string, JsonSchema.JsonSchema> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = p.schema ?? { type: 'string' };
    if (p.required || p.in === 'path' || route.includes(`{${p.name}}`)) {
      required.push(p.name);
    }
  }
  if (body && isObjectSchema(body)) {
    Object.assign(properties, body['properties']);
    required.push(...((body['required'] as string[] | undefined) ?? []));
  } else if (body) {
    return { allOf: [{ type: 'object', properties, required }, body] };
  }
  return { type: 'object', properties, required };
}

function success(op: Operation) {
  const codes = Object.keys(op.responses ?? {})
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  const status = codes[0] ?? '200';
  const content = op.responses?.[status]?.content;
  const sse = content?.['text/event-stream'];
  return {
    status: Number(status),
    sse: sse !== undefined,
    schema: sse?.schema ?? content?.['application/json']?.schema,
  };
}

/** Error responses in @trpc12/trpc's shape (`{ code: { const }, data? }`), except the input validation error every input gets. */
function declaredErrors(
  op: Operation,
  resolve: (s: JsonSchema.JsonSchema) => JsonSchema.JsonSchema,
) {
  return Object.entries(op.responses ?? {}).flatMap(([status, response]) => {
    if (!/^[45]\d\d$/.test(status)) return [];
    const raw = response.content?.['application/json']?.schema;
    const schema = raw ? resolve(raw) : undefined;
    const properties = schema?.['properties'] as
      | Record<string, JsonSchema.JsonSchema>
      | undefined;
    const code = properties?.['code']?.['const'];
    if (typeof code !== 'string' || code === 'BAD_REQUEST') return [];
    return [{ code, status: Number(status), data: properties?.['data'] }];
  });
}

const SUBSCHEMAS = new Set([
  'items',
  'prefixItems',
  'anyOf',
  'oneOf',
  'not',
  'additionalProperties',
]);

/**
 * Objects that don't mention `additionalProperties` become closed structs
 * (Effect still ignores excess keys when decoding), except where `allOf`
 * merges them: two closed objects never intersect.
 */
function closeObjects(
  schema: JsonSchema.JsonSchema,
  merged: boolean,
): JsonSchema.JsonSchema {
  const out: Record<string, unknown> = { ...schema };
  if (
    !merged &&
    out['type'] === 'object' &&
    out['properties'] !== undefined &&
    out['additionalProperties'] === undefined
  ) {
    out['additionalProperties'] = false;
  }
  const visit = (v: unknown, inner: boolean): unknown =>
    Array.isArray(v)
      ? v.map((x) => visit(x, inner))
      : typeof v === 'object' && v !== null
        ? closeObjects(v as JsonSchema.JsonSchema, inner)
        : v;
  for (const [k, v] of Object.entries(out)) {
    if (k === 'properties' && typeof v === 'object' && v !== null) {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([p, s]) => [p, visit(s, false)]),
      );
    } else if (k === 'allOf') {
      out[k] = visit(v, true);
    } else if (SUBSCHEMAS.has(k)) {
      out[k] = visit(v, false);
    }
  }
  return out as JsonSchema.JsonSchema;
}

const nonEmpty = (s: JsonSchema.JsonSchema | undefined) =>
  s !== undefined && Object.keys(s).length > 0 ? s : undefined;

/**
 * Generates a `@trpc12/trpc/contract` module from an OpenAPI document: Effect
 * Schemas for every component and for each operation's input and output
 * (Effect's `SchemaRepresentation` does the JSON Schema translation), and a
 * contract whose `route` meta matches the document, ready for
 * `openApiLink({ contract: toContract(contract) })`.
 *
 * Procedure paths come from `operationId`s (dots nest), or from the method
 * and path. `GET` operations are queries, `text/event-stream` responses
 * subscriptions, the rest mutations. Path and query parameters merge into
 * one input object with the JSON body, as `inputStructure: 'compact'` does.
 *
 * @example
 * ```ts
 * import { generateContractFromOpenApi } from '@trpc12/trpc/openapi';
 *
 * const source = generateContractFromOpenApi(await (await fetch(url)).json());
 * await writeFile('src/petstore.ts', source);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function generateContractFromOpenApi(
  document: OpenApiSource,
  opts: GenerateContractOptions = {},
): string {
  const v30 = document.openapi.startsWith('3.0');
  const convert = (s: unknown): JsonSchema.JsonSchema =>
    (v30
      ? JsonSchema.fromSchemaOpenApi3_0(s as JsonSchema.JsonSchema)
      : JsonSchema.fromSchemaOpenApi3_1(s as JsonSchema.JsonSchema)
    ).schema;
  const prefix = (opts.prefix ?? '').replace(/\/+$/, '');
  const components = document.components?.schemas ?? {};
  const resolve = (s: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
    const ref = s['$ref'];
    return typeof ref === 'string' && ref.startsWith('#/components/schemas/')
      ? ((components[ref.slice(21)] as JsonSchema.JsonSchema | undefined) ?? s)
      : s;
  };

  const leaves: Leaf[] = [];
  const roots: JsonSchema.JsonSchema[] = [];
  const rootNames: string[] = [];
  const addRoot = (name: string, schema: JsonSchema.JsonSchema | undefined) => {
    if (!nonEmpty(schema)) return undefined;
    rootNames.push(name);
    roots.push(convert(schema));
    return name;
  };

  for (const [rawPath, item] of Object.entries(document.paths ?? {})) {
    const route =
      prefix && rawPath.startsWith(prefix)
        ? rawPath.slice(prefix.length) || '/'
        : rawPath;
    for (const method of METHODS) {
      const op = item[method] as Operation | undefined;
      if (!op) continue;
      const path = op.operationId
        ? op.operationId.split('.').map((s) => camel([s]))
        : [camel([method, ...route.split('/')])];
      const name = pascal(path);
      const out = success(op);
      leaves.push({
        path,
        name,
        type: out.sse
          ? 'subscription'
          : method === 'get'
            ? 'query'
            : 'mutation',
        method: method.toUpperCase(),
        route,
        successStatus: out.status,
        input: addRoot(`${name}Input`, inputSchema(op, route)),
        output: addRoot(`${name}Output`, out.schema),
        errors: declaredErrors(op, resolve).map((e) => ({
          ...e,
          data: addRoot(`${name}${pascal([e.code.toLowerCase()])}Data`, e.data),
        })),
      });
    }
  }

  const merged = new Set<string>();
  const collect = (node: unknown, inAllOf: boolean): void => {
    if (Array.isArray(node)) return node.forEach((n) => collect(n, inAllOf));
    if (typeof node !== 'object' || node === null) return;
    const ref = (node as { $ref?: unknown }).$ref;
    if (inAllOf && typeof ref === 'string') merged.add(ref.split('/').at(-1)!);
    for (const [k, v] of Object.entries(node)) collect(v, k === 'allOf');
  };
  collect([document, roots], false);
  const definitions = Object.fromEntries(
    Object.entries(components).map(([k, s]) => [
      k,
      closeObjects(convert(s), merged.has(k)),
    ]),
  );
  for (const [i, root] of roots.entries()) {
    roots[i] = closeObjects(root, false);
  }
  const lines: string[] = [
    '// Generated by @trpc12/trpc generateContractFromOpenApi. Do not edit.',
    "import { Schema } from 'effect';",
    "import { contract as trpcContract } from '@trpc12/trpc/contract';",
    "import { openapi } from '@trpc12/trpc/openapi';",
    '',
  ];

  if (roots.length > 0) {
    const schemas = SchemaRepresentation.fromJsonSchemaMultiDocument(
      {
        dialect: 'draft-2020-12',
        schemas: roots as [JsonSchema.JsonSchema, ...JsonSchema.JsonSchema[]],
        definitions,
      },
      { patterns: opts.patterns ?? 'ignore' },
    );
    const code = SchemaRepresentation.toCodeDocument(
      SchemaRepresentation.toRepresentations(
        schemas.map((s) => s.ast) as never,
      ),
    );
    for (const artifact of code.artifacts) {
      if (Predicate.isTagged(artifact, 'Import'))
        lines.push(artifact.importDeclaration);
    }
    for (const artifact of code.artifacts) {
      if (!Predicate.isTagged(artifact, 'Import')) {
        lines.push(`const ${artifact.identifier} = ${artifact.code.runtime}`);
      }
    }
    const recursives = Object.entries(code.references.recursives);
    for (const [ref, c] of recursives) {
      lines.push(
        `export type ${ref} = ${c.Type}`,
        `export const ${ref}: Schema.Codec<${ref}> = Schema.suspend((): Schema.Codec<${ref}> => ${ref}$)`,
      );
    }
    for (const { $ref, code: c } of code.references.nonRecursives) {
      lines.push(`export type ${$ref} = ${c.Type}`);
      lines.push(`export const ${$ref} = ${c.runtime}`);
    }
    for (const [ref, c] of recursives) {
      lines.push(`const ${ref}$ = ${c.runtime}`);
    }
    code.codes.forEach((c, i) => {
      lines.push(`export const ${rootNames[i]} = ${c.runtime}`);
    });
    lines.push('');
  }

  type Tree = { [k: string]: Tree | Leaf };
  const tree: Tree = {};
  for (const leaf of leaves) {
    let node = tree;
    for (const segment of leaf.path.slice(0, -1)) {
      const next = node[segment];
      if (next && 'route' in next) {
        throw new Error(
          `generateContractFromOpenApi: "${leaf.path.join('.')}" nests under the operation "${segment}"`,
        );
      }
      node = (node[segment] ??= {}) as Tree;
    }
    const last = leaf.path.at(-1)!;
    if (node[last]) {
      throw new Error(
        `generateContractFromOpenApi: two operations map to "${leaf.path.join('.')}"`,
      );
    }
    node[last] = leaf;
  }

  const render = (node: Tree, indent: string): string =>
    Object.entries(node)
      .map(([k, v]) => {
        if (!('route' in v)) {
          return `${indent}${key(k)}: {\n${render(v as Tree, `${indent}  `)}${indent}},\n`;
        }
        const leaf = v as Leaf;
        const route = [
          `method: '${leaf.method}'`,
          `path: ${JSON.stringify(leaf.route)}`,
          ...(leaf.successStatus === 200
            ? []
            : [`successStatus: ${leaf.successStatus}`]),
        ].join(', ');
        const errors = leaf.errors.length
          ? `.errors({ ${leaf.errors
              .map(
                (e) =>
                  `${key(e.code)}: { status: ${e.status}${e.data ? `, data: ${e.data}` : ''} }`,
              )
              .join(', ')} })`
          : '';
        return `${indent}${key(k)}: c${leaf.input ? `.input(${leaf.input})` : ''}${
          leaf.output ? `.output(${leaf.output})` : ''
        }${errors}.meta({ route: { ${route} } }).${leaf.type}(),\n`;
      })
      .join('');

  lines.push(
    'const c = trpcContract.create().concat(openapi());',
    '',
    `export const ${opts.exportName ?? 'contract'} = {\n${render(tree, '  ')}};`,
    '',
  );
  return lines.join('\n');
}
