import { JsonSchema, Predicate, SchemaRepresentation } from 'effect';

/**
 * An OpenAPI 3.0 or 3.1 document, as {@link experimental_generateContractFromOpenApi}
 * reads it.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiSource {
  readonly openapi: string;
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: {
    readonly schemas?: Readonly<Record<string, unknown>>;
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly requestBodies?: Readonly<Record<string, unknown>>;
    readonly responses?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Options for {@link experimental_generateContractFromOpenApi}.
 * @since 0.1.0
 * @stability experimental
 */
export interface GenerateContractOptions {
  /**
   * Stripped from each path, as `experimental_openApiLink`'s `prefix` adds it back.
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

type Content = Readonly<
  Record<string, { readonly schema?: JsonSchema.JsonSchema }>
>;

interface RequestBody {
  readonly required?: boolean;
  readonly content?: Content;
}

interface Response {
  readonly content?: Content;
}

interface Operation {
  readonly operationId?: string;
  readonly parameters?: ReadonlyArray<unknown>;
  readonly requestBody?: unknown;
  readonly responses?: Readonly<Record<string, unknown>>;
}

/** Header parameters OpenAPI says to ignore: the request's own media types and auth. */
const IGNORED_HEADERS = new Set(['accept', 'content-type', 'authorization']);

interface Leaf {
  readonly path: ReadonlyArray<string>;
  readonly name: string;
  readonly type: 'query' | 'mutation' | 'subscription';
  readonly method: string;
  readonly route: string;
  readonly detailed: boolean;
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
  content: Content | undefined,
): JsonSchema.JsonSchema | undefined =>
  content?.['application/json']?.schema ??
  content?.['multipart/form-data']?.schema ??
  content?.['application/x-www-form-urlencoded']?.schema;

const isObjectSchema = (s: JsonSchema.JsonSchema) =>
  s['type'] === 'object' && s['properties'] !== undefined;

/** Follows `$ref`s to parameters, request bodies and responses (`#/components/…`). */
type Deref = <T>(node: unknown) => T | undefined;

const objectOf = (
  params: ReadonlyArray<Parameter>,
  route: string,
): JsonSchema.JsonSchema => {
  const properties: Record<string, JsonSchema.JsonSchema> = {};
  const required: string[] = [];
  for (const p of params) {
    const name = p.in === 'header' ? p.name.toLowerCase() : p.name;
    properties[name] = p.schema ?? { type: 'string' };
    if (p.required || p.in === 'path' || route.includes(`{${p.name}}`)) {
      required.push(name);
    }
  }
  return { type: 'object', properties, required };
};

/**
 * Path-level parameters, overridden by the operation's own (same `name` and
 * `in`). Cookies are left out: a browser `fetch` can't set them.
 */
function parametersOf(
  item: Readonly<Record<string, unknown>>,
  op: Operation,
  deref: Deref,
): ReadonlyArray<Parameter> {
  const byKey = new Map<string, Parameter>();
  const shared =
    (item['parameters'] as ReadonlyArray<unknown> | undefined) ?? [];
  for (const raw of [...shared, ...(op.parameters ?? [])]) {
    const p = deref<Parameter>(raw);
    if (!p || typeof p.name !== 'string') continue;
    if (p.in === 'header' && IGNORED_HEADERS.has(p.name.toLowerCase())) {
      continue;
    }
    if (p.in === 'path' || p.in === 'query' || p.in === 'header') {
      byKey.set(`${p.in}:${p.name}`, p);
    }
  }
  return [...byKey.values()];
}

/**
 * Path and query parameters merge with the body into one input
 * (`inputStructure: 'compact'`). Header parameters can't, as the link sends
 * a compact input's keys as the path, query or body: those operations take
 * `{ params, query, headers, body }` (`'detailed'`).
 */
function inputSchema(
  params: ReadonlyArray<Parameter>,
  requestBody: RequestBody | undefined,
  route: string,
): { schema: JsonSchema.JsonSchema | undefined; detailed: boolean } {
  const body = jsonBody(requestBody?.content);
  if (params.some((p) => p.in === 'header')) {
    const properties: Record<string, JsonSchema.JsonSchema> = {};
    const required: string[] = [];
    for (const [part, where] of [
      ['params', 'path'],
      ['query', 'query'],
      ['headers', 'header'],
    ] as const) {
      const of = params.filter((p) => p.in === where);
      if (of.length === 0) continue;
      const schema = objectOf(of, route);
      properties[part] = schema;
      if ((schema['required'] as string[]).length > 0) required.push(part);
    }
    if (body) {
      properties['body'] = body;
      if (requestBody?.required) required.push('body');
    }
    return { schema: { type: 'object', properties, required }, detailed: true };
  }
  if (params.length === 0) return { schema: body, detailed: false };
  const merged = objectOf(params, route);
  const properties = merged['properties'] as Record<
    string,
    JsonSchema.JsonSchema
  >;
  const required = merged['required'] as string[];
  if (body && isObjectSchema(body)) {
    Object.assign(properties, body['properties']);
    required.push(...((body['required'] as string[] | undefined) ?? []));
  } else if (body) {
    return { schema: { allOf: [merged, body] }, detailed: false };
  }
  return { schema: merged, detailed: false };
}

function success(op: Operation, deref: Deref) {
  const codes = Object.keys(op.responses ?? {})
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  const status = codes[0] ?? '200';
  const content = deref<Response>(op.responses?.[status])?.content;
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
  deref: Deref,
) {
  return Object.entries(op.responses ?? {}).flatMap(([status, response]) => {
    if (!/^[45]\d\d$/.test(status)) return [];
    const raw =
      deref<Response>(response)?.content?.['application/json']?.schema;
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

// effect 4.0.6 started collapsing these leading checks on a bare
// `Schema.Number` into the built-in schema; collapse them on older 4.x too,
// so the generated module doesn't depend on the installed version.
const canonicalNumbers: Record<string, string> = {
  'Schema.isInt().annotate({ "expected": "an integer" })': 'Schema.Int',
  'Schema.isFinite().annotate({ "expected": "a finite number" })':
    'Schema.Finite',
};
const canonicalize = (source: string) =>
  Object.entries(canonicalNumbers).reduce(
    (out, [check, schema]) =>
      out.replaceAll(`Schema.Number.check(${check})`, schema),
    source,
  );

/**
 * Generates a `@trpc12/trpc/contract` module from an OpenAPI document: Effect
 * Schemas for every component and for each operation's input and output
 * (Effect's `SchemaRepresentation` does the JSON Schema translation), and a
 * contract whose `route` meta matches the document, ready for
 * `experimental_openApiLink({ contract: experimental_toContract(contract) })`.
 *
 * Procedure paths come from `operationId`s (dots nest), or from the method
 * and path. `GET` operations are queries, `text/event-stream` responses
 * subscriptions, the rest mutations. Path and query parameters merge into
 * one input object with the JSON body, as `inputStructure: 'compact'` does.
 *
 * @example
 * ```ts
 * import { experimental_generateContractFromOpenApi } from '@trpc12/trpc/openapi';
 *
 * const source = experimental_generateContractFromOpenApi(await (await fetch(url)).json());
 * await writeFile('src/petstore.ts', source);
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_generateContractFromOpenApi(
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
  const deref: Deref = <T>(node: unknown): T | undefined => {
    for (let seen = 0; seen < 32; seen++) {
      const ref = (node as { $ref?: unknown } | undefined)?.$ref;
      if (typeof ref !== 'string') return node as T | undefined;
      if (!ref.startsWith('#/')) return undefined;
      node = ref
        .slice(2)
        .split('/')
        .map((s) =>
          decodeURIComponent(s).replace(/~1/g, '/').replace(/~0/g, '~'),
        )
        .reduce<unknown>(
          (at, segment) =>
            typeof at === 'object' && at !== null
              ? (at as Record<string, unknown>)[segment]
              : undefined,
          document,
        );
    }
    return undefined;
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
      const out = success(op, deref);
      const input = inputSchema(
        parametersOf(item, op, deref),
        deref<RequestBody>(op.requestBody),
        route,
      );
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
        detailed: input.detailed,
        successStatus: out.status,
        input: addRoot(`${name}Input`, input.schema),
        output: addRoot(`${name}Output`, out.schema),
        errors: declaredErrors(op, resolve, deref).map((e) => ({
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
    '// Generated by @trpc12/trpc experimental_generateContractFromOpenApi. Do not edit.',
    "import { Schema } from 'effect';",
    "import { experimental_contract as trpcContract } from '@trpc12/trpc/contract';",
    "import { experimental_openapi } from '@trpc12/trpc/openapi';",
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
          `experimental_generateContractFromOpenApi: "${leaf.path.join('.')}" nests under the operation "${segment}"`,
        );
      }
      node = (node[segment] ??= {}) as Tree;
    }
    const last = leaf.path.at(-1)!;
    if (node[last]) {
      throw new Error(
        `experimental_generateContractFromOpenApi: two operations map to "${leaf.path.join('.')}"`,
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
          ...(leaf.detailed ? [`inputStructure: 'detailed'`] : []),
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
    'const c = trpcContract.create().concat(experimental_openapi());',
    '',
    `export const ${opts.exportName ?? 'contract'} = {\n${render(tree, '  ')}};`,
    '',
  );
  return canonicalize(lines.join('\n'));
}
