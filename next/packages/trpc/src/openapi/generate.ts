import {
  assertLoaded,
  flattenRoutes,
  inputJsonSchema,
  outputJsonSchema,
  scopedRoute,
} from '../internal/describe.ts';
import { ERROR_STATUS } from '../internal/error.ts';
import { toJsonSchema, type JsonSchema } from '../internal/json-schema.ts';
import type {
  AnyProcedure,
  ProcedureInternals,
} from '../server/procedures/index.ts';
import {
  propertySchema,
  normalizePrefix,
  experimental_resolveRoute,
  routeOf,
  usesQuery,
  type OperationSpec,
} from './rest/index.ts';

type Schema = Exclude<JsonSchema, boolean>;

/**
 * An OpenAPI 3.1 document. Loosely typed: it is meant to be served or
 * written to a file.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiDocument {
  readonly openapi: '3.1.1';
  readonly info: OpenApiInfo;
  readonly servers?: ReadonlyArray<OpenApiServer>;
  readonly security?: ReadonlyArray<OpenApiSecurityRequirement>;
  readonly tags?: ReadonlyArray<OpenApiTag>;
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
  readonly components: {
    readonly schemas: Record<string, JsonSchema>;
    readonly securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
  };
}

/**
 * A security scheme in `components.securitySchemes`. Generated clients (Hey
 * API's `auth`, for one) read it with each operation's `security` to attach
 * credentials.
 * @since 0.1.0
 * @stability experimental
 */
export type OpenApiSecurityScheme = { readonly description?: string } & (
  | {
      readonly type: 'http';
      /** `bearer` or `basic`, or another HTTP auth scheme. */
      readonly scheme: string;
      readonly bearerFormat?: string;
    }
  | {
      readonly type: 'apiKey';
      readonly in: 'header' | 'query' | 'cookie';
      readonly name: string;
    }
  | {
      readonly type: 'oauth2';
      readonly flows: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'openIdConnect'; readonly openIdConnectUrl: string }
  | { readonly type: 'mutualTLS' }
);

/**
 * Security schemes that together authorize a request, by name, with OAuth
 * scopes (`[]` for other schemes). A list of them is alternatives; `[]`
 * makes an operation public.
 * @since 0.1.0
 * @stability experimental
 */
export type OpenApiSecurityRequirement = Readonly<
  Record<string, ReadonlyArray<string>>
>;

/**
 * A tag the document describes, in the order docs UIs list them.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiTag {
  readonly name: string;
  readonly description?: string;
  readonly externalDocs?: {
    readonly url: string;
    readonly description?: string;
  };
}

/**
 * The document's `info`.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

/**
 * A server the document lists.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiServer {
  readonly url: string;
  readonly description?: string;
}

/**
 * One operation of an {@link OpenApiDocument}.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiOperation {
  readonly operationId: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly deprecated?: boolean;
  readonly security?: ReadonlyArray<OpenApiSecurityRequirement>;
  readonly parameters?: ReadonlyArray<Record<string, unknown>>;
  readonly requestBody?: Record<string, unknown>;
  readonly responses: Record<string, Record<string, unknown>>;
}

/**
 * The options of {@link experimental_generateOpenApi}.
 * @since 0.1.0
 * @stability experimental
 */
export interface GenerateOpenApiOptions {
  info: OpenApiInfo;
  servers?: ReadonlyArray<OpenApiServer>;
  /**
   * Merged into the document's `components`; `schemas` the generator
   * writes win over yours.
   */
  components?: {
    readonly schemas?: Readonly<Record<string, JsonSchema>>;
    readonly securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
  };
  /**
   * The security every operation needs unless its `route.spec` sets its own
   * (`security: []` for a public one).
   */
  security?: ReadonlyArray<OpenApiSecurityRequirement>;
  tags?: ReadonlyArray<OpenApiTag>;
  /**
   * `'openapi'` documents the REST mapping {@link experimental_createOpenApiHandler}
   * serves (`route` meta). `'rpc'` documents the RPC endpoint of
   * `createFetchHandler` with zero configuration (O-C).
   * @default 'openapi'
   */
  target?: 'openapi' | 'rpc';
  /**
   * The handler's prefix (`'openapi'`) or endpoint (`'rpc'`).
   * @default '/api', or '/trpc' for `'rpc'`
   */
  prefix?: string;
  /** Leaves procedures out of the document. */
  filter?: (opts: { path: string; procedure: AnyProcedure }) => boolean;
}

const UNTYPED_ERROR = 'TrpcUntypedError';

/** The built-in codes a server can answer with; the rest are client-side only. */
const SERVER_CODES = Object.entries(ERROR_STATUS)
  .filter(([, status]) => status > 0)
  .map(([code]) => code);

/** Moves `$defs` into `components.schemas` and rewrites their `$ref`s. */
function hoist(
  schema: JsonSchema | undefined,
  scope: string,
  components: Record<string, JsonSchema>,
): JsonSchema | undefined {
  if (!schema || typeof schema !== 'object') return schema;
  const defs = schema['$defs'] as Record<string, JsonSchema> | undefined;
  if (!defs) return schema;
  const name = (key: string) => `${scope}.${key}`;
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (typeof node !== 'object' || node === null) return node;
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === '$ref' && typeof v === 'string' && v.startsWith('#/$defs/')
          ? `#/components/schemas/${name(decodeURIComponent(v.slice(8)))}`
          : rewrite(v),
      ]),
    );
  };
  for (const [key, def] of Object.entries(defs)) {
    components[name(key)] = rewrite(def) as JsonSchema;
  }
  const { $defs: _, ...rest } = schema;
  return rewrite(rest) as JsonSchema;
}

const withoutProperties = (
  schema: JsonSchema | undefined,
  keys: ReadonlyArray<string>,
): JsonSchema | undefined => {
  if (!schema || typeof schema !== 'object' || keys.length === 0) return schema;
  const properties = schema['properties'] as
    | Record<string, JsonSchema>
    | undefined;
  if (!properties) return schema;
  const rest = Object.fromEntries(
    Object.entries(properties).filter(([k]) => !keys.includes(k)),
  );
  const required = (schema['required'] as string[] | undefined)?.filter(
    (k) => !keys.includes(k),
  );
  return {
    ...schema,
    properties: rest,
    ...(required ? { required } : {}),
  };
};

const objectProperties = (
  schema: JsonSchema | undefined,
): Array<[name: string, schema: JsonSchema, required: boolean]> => {
  if (!schema || typeof schema !== 'object') return [];
  const parts = [schema, ...((schema['allOf'] as Schema[] | undefined) ?? [])];
  return parts.flatMap((part) => {
    const properties = part['properties'] as
      | Record<string, JsonSchema>
      | undefined;
    const required = (part['required'] as string[] | undefined) ?? [];
    return Object.entries(properties ?? {}).map(
      ([name, s]): [string, JsonSchema, boolean] => [
        name,
        s,
        required.includes(name),
      ],
    );
  });
};

const isBinary = (node: Schema) =>
  node['format'] === 'binary' ||
  node['contentEncoding'] === 'binary' ||
  (typeof node['contentMediaType'] === 'string' &&
    !/json|^text\//.test(node['contentMediaType']));

const hasBinary = (
  node: unknown,
  components: Record<string, JsonSchema>,
  seen = new Set<unknown>(),
): boolean => {
  if (typeof node !== 'object' || node === null || seen.has(node)) return false;
  seen.add(node);
  if (Array.isArray(node))
    return node.some((n) => hasBinary(n, components, seen));
  const schema = node as Schema;
  const ref = schema['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) {
    const target = components[ref.slice('#/components/schemas/'.length)];
    if (hasBinary(target, components, seen)) return true;
  }
  return (
    isBinary(schema) ||
    Object.entries(schema).some(
      ([key, value]) =>
        key !== 'not' && key !== '$ref' && hasBinary(value, components, seen),
    )
  );
};

/** JSON can't carry a file, so a body with one is `multipart/form-data`, which the handler reads as bracket notation. */
const bodyContent = (
  schema: JsonSchema | undefined,
  components: Record<string, JsonSchema>,
) => ({
  [hasBinary(schema, components) ? 'multipart/form-data' : 'application/json']:
    { schema },
});

const isStructured = (schema: JsonSchema) =>
  typeof schema === 'object' &&
  (schema['type'] === 'object' || schema['properties'] !== undefined);

const errorSchema = (code: string, data?: JsonSchema): Schema => ({
  type: 'object',
  properties: {
    defined: { const: true },
    code: { const: code },
    message: { type: 'string' },
    ...(data ? { data } : {}),
  },
  required: ['defined', 'code', 'message', ...(data ? ['data'] : [])],
});

const VALIDATION_DATA: Schema = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          path: { type: 'array', items: { type: ['string', 'number'] } },
        },
        required: ['message'],
      },
    },
  },
  required: ['issues'],
};

const rpcWrap = (schema: JsonSchema | undefined): Schema => ({
  type: 'object',
  properties: { json: schema ?? {} },
  required: ['json'],
});

/**
 * What the TypeScript-based generator read from a procedure's types. The
 * runtime schemas win; these fill the gaps.
 * @internal
 */
export interface InferredTypes {
  readonly input?: JsonSchema | undefined;
  readonly output?: JsonSchema | undefined;
  readonly errors: ReadonlyArray<{
    readonly code: string;
    readonly status: number;
    readonly data?: JsonSchema | undefined;
  }>;
}

function errorResponses(
  def: ProcedureInternals,
  scope: string,
  components: Record<string, JsonSchema>,
  hasInput: boolean,
  target: 'openapi' | 'rpc',
  inferred: InferredTypes['errors'],
): Record<string, Record<string, unknown>> {
  const byStatus = new Map<number, Schema[]>();
  const add = (status: number, schema: Schema) =>
    byStatus.set(status, [...(byStatus.get(status) ?? []), schema]);
  const codes = new Set(Object.keys(def.errors));
  if (hasInput) {
    codes.add('BAD_REQUEST');
    add(400, errorSchema('BAD_REQUEST', VALIDATION_DATA));
  }
  for (const e of inferred) {
    if (codes.has(e.code)) continue;
    codes.add(e.code);
    add(
      e.status,
      errorSchema(e.code, hoist(e.data, `${scope}.${e.code}`, components)),
    );
  }
  for (const [code, spec] of Object.entries(def.errors)) {
    const status =
      spec.status ?? (ERROR_STATUS as Record<string, number>)[code] ?? 400;
    const data = spec.data
      ? hoist(toJsonSchema(spec.data, 'output'), `${scope}.${code}`, components)
      : undefined;
    add(status, errorSchema(code, data ?? (spec.data ? {} : undefined)));
  }
  const responses: Record<string, Record<string, unknown>> = {};
  for (const [status, schemas] of [...byStatus].sort(([a], [b]) => a - b)) {
    const schema = schemas.length === 1 ? schemas[0]! : { anyOf: schemas };
    responses[String(status)] = {
      description: schemas
        .map((s) => (s['properties'] as { code: { const: string } }).code.const)
        .join(' | '),
      content: {
        'application/json': {
          schema:
            target === 'rpc'
              ? rpcWrap({ type: 'object', properties: { error: schema } })
              : schema,
        },
      },
    };
  }
  // Typed errors this operation doesn't document can only have the other
  // built-in codes, so `defined && code === 'NOT_FOUND'` narrows to the 404.
  const others = SERVER_CODES.filter((code) => !codes.has(code));
  const fallback: Schema = {
    anyOf: [
      { $ref: `#/components/schemas/${UNTYPED_ERROR}` },
      ...(others.length
        ? [
            {
              type: 'object',
              properties: {
                defined: { const: true },
                code: { enum: others },
                message: { type: 'string' },
                data: {},
              },
              required: ['defined', 'code', 'message'],
            },
          ]
        : []),
    ],
  };
  responses['default'] = {
    description: 'An untyped error, or a typed one with another built-in code',
    content: {
      'application/json': {
        schema:
          target === 'rpc'
            ? rpcWrap({ type: 'object', properties: { error: fallback } })
            : fallback,
      },
    },
  };
  return responses;
}

/**
 * Generates an OpenAPI 3.1 document from a router's schemas (18 (c)), with
 * any schema library that implements [Standard JSON
 * Schema](https://standardschema.dev/json-schema) (zod 4, ArkType, …) and
 * Effect Schema. Declared errors become responses with their status and
 * `data` schema; procedures with an input document the 400 validation
 * error. Procedures without static schemas (no `.input()`, or a ctx
 * callback) get `{}`.
 *
 * @example
 * ```ts
 * const spec = experimental_generateOpenApi(appRouter, {
 *   info: { title: 'API', version: '1.0.0' },
 *   servers: [{ url: 'https://api.example.com' }],
 * });
 * await fs.writeFile('openapi.json', JSON.stringify(spec, null, 2));
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_generateOpenApi(
  router: object,
  opts: GenerateOpenApiOptions,
): OpenApiDocument {
  return generateDocument(router, opts);
}

/** {@link experimental_generateOpenApi}, with types read by `@trpc12/trpc/openapi/typescript`. @internal */
export function generateDocument(
  router: object,
  opts: GenerateOpenApiOptions,
  infer?: (path: string) => InferredTypes | undefined,
): OpenApiDocument {
  const target = opts.target ?? 'openapi';
  const prefix =
    target === 'rpc'
      ? normalizePrefix(opts.prefix ?? '/trpc')
      : normalizePrefix(opts.prefix);
  const components: Record<string, JsonSchema> = {
    [UNTYPED_ERROR]: {
      type: 'object',
      properties: {
        defined: { const: false },
        code: { type: 'string' },
        message: { type: 'string' },
        data: {},
      },
      required: ['defined', 'code', 'message'],
    },
  };
  const paths: OpenApiDocument['paths'] = {};

  for (const { path, procedure, scope } of assertLoaded(flattenRoutes(router))
    .procedures) {
    if (opts.filter && !opts.filter({ path, procedure })) continue;
    const def = procedure['~trpc'];
    const scoped = scopedRoute(path, routeOf(def), scope);
    const route =
      target === 'rpc'
        ? experimental_resolveRoute(
            path,
            def.type,
            { path: `/${path}` },
            prefix,
          )
        : experimental_resolveRoute(path, def.type, scoped, prefix);
    const types = infer?.(path);
    const input = hoist(
      inputJsonSchema(def) ?? types?.input,
      `${path}.input`,
      components,
    );
    const rawOutput = outputJsonSchema(def) ?? types?.output;
    const detailedIn =
      target === 'openapi' && route.inputStructure === 'detailed';
    const detailedOut =
      target === 'openapi' && route.outputStructure === 'detailed';
    const output = hoist(
      detailedOut ? propertySchema(rawOutput, 'body') : rawOutput,
      `${path}.output`,
      components,
    );

    const parameters: Record<string, unknown>[] = [];
    let requestBody: Record<string, unknown> | undefined;
    const param = (
      name: string,
      where: string,
      schema: JsonSchema,
      required: boolean,
    ) => {
      parameters.push({
        name,
        in: where,
        required: where === 'path' ? true : required,
        schema,
        ...(where === 'query' && isStructured(schema)
          ? { style: 'deepObject', explode: true }
          : {}),
      });
    };

    if (detailedIn) {
      for (const [name, schema] of objectProperties(
        propertySchema(input, 'params'),
      )) {
        param(name, 'path', schema, true);
      }
      for (const [name, schema, required] of objectProperties(
        propertySchema(input, 'query'),
      )) {
        param(name, 'query', schema, required);
      }
      for (const [name, schema, required] of objectProperties(
        propertySchema(input, 'headers'),
      )) {
        param(name, 'header', schema, required);
      }
      const body = propertySchema(input, 'body');
      if (body !== undefined && !usesQuery(route.method)) {
        requestBody = {
          required: true,
          content: bodyContent(body, components),
        };
      }
    } else {
      for (const name of route.params) {
        param(
          name,
          'path',
          propertySchema(input, name) ?? { type: 'string' },
          true,
        );
      }
      if (target === 'rpc' && !usesQuery(route.method)) {
        if (input) {
          requestBody = {
            required: true,
            content: { 'application/json': { schema: rpcWrap(input) } },
          };
        }
      } else if (usesQuery(route.method)) {
        for (const [name, schema, required] of objectProperties(input)) {
          if (!route.params.includes(name))
            param(name, 'query', schema, required);
        }
      } else if (input) {
        const body = withoutProperties(input, route.params);
        const properties = (body as Schema)['properties'];
        const empty =
          route.params.length > 0 &&
          typeof properties === 'object' &&
          properties !== null &&
          Object.keys(properties).length === 0;
        if (!empty)
          requestBody = {
            required: Boolean(
              ((body as Schema)['required'] as unknown[] | undefined)?.length,
            ),
            content: bodyContent(body, components),
          };
      }
    }

    const success =
      def.type === 'subscription'
        ? {
            description:
              'A stream of server-sent events. Each `message` event carries one event as JSON; `id` is set for `tracked()` events.',
            content: {
              'text/event-stream': {
                schema: target === 'rpc' ? rpcWrap(output) : (output ?? {}),
              },
            },
          }
        : {
            description: 'OK',
            content: {
              'application/json': {
                schema: target === 'rpc' ? rpcWrap(output) : (output ?? {}),
              },
            },
          };

    const r = scoped;
    const operation: OpenApiOperation = {
      operationId: (target === 'openapi' && r?.operationId) || path,
      ...(r?.summary ? { summary: r.summary } : {}),
      ...(r?.description ? { description: r.description } : {}),
      ...(r?.tags ? { tags: r.tags } : {}),
      ...(r?.deprecated ? { deprecated: true } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [String(target === 'rpc' ? 200 : route.successStatus)]: success,
        ...errorResponses(
          def,
          path,
          components,
          input !== undefined,
          target,
          types?.errors ?? [],
        ),
      },
    };
    const spec = target === 'openapi' ? r?.spec : undefined;
    const methods = (paths[route.path] ??= {});
    methods[route.method.toLowerCase()] = (
      typeof spec === 'function'
        ? spec(operation as unknown as OperationSpec)
        : (spec ?? operation)
    ) as OpenApiOperation;
  }

  return {
    openapi: '3.1.1',
    info: opts.info,
    ...(opts.servers ? { servers: opts.servers } : {}),
    ...(opts.security ? { security: opts.security } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    paths,
    components: {
      ...opts.components,
      schemas: { ...opts.components?.schemas, ...components },
    },
  };
}
