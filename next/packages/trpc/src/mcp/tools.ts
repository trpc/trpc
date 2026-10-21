import type { ProcedureJson } from '../contract/index.ts';
import {
  assertLoaded,
  flattenRoutes,
  procedureJson,
} from '../internal/describe.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import type { ProcedureType } from '../internal/types.ts';
import { routeOf } from '../openapi/rest/index.ts';
import type { AnyProcedure } from '../server/procedures/index.ts';
import { isStreamSchema } from '../server/validation/index.ts';
import type {
  McpIcon,
  McpMeta,
  McpToolAnnotations,
  McpToolMeta,
} from './extension.ts';

/**
 * A JSON Schema whose top level is an object, as MCP requires of a tool's
 * `inputSchema` and `outputSchema`.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpObjectSchema {
  readonly type: 'object';
  readonly [key: string]: unknown;
}

/**
 * An MCP tool, as `tools/list` sends it.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpTool {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: McpObjectSchema;
  readonly outputSchema?: McpObjectSchema;
  readonly annotations: McpToolAnnotations;
  readonly icons?: ReadonlyArray<McpIcon>;
  /** The procedure behind the tool, for clients that map one back. */
  readonly _meta: {
    readonly 'io.trpc/path': string;
    readonly 'io.trpc/type': ProcedureType;
    /** The codes the procedure declares with `.errors()`. */
    readonly 'io.trpc/errors'?: ReadonlyArray<string>;
  };
}

/**
 * A procedure the `include` predicate decides on.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpToolInfo {
  /** The dotted path: `post.byId`. */
  readonly path: string;
  readonly type: ProcedureType;
  readonly meta: object;
}

/**
 * Which procedures become tools, and how they're named.
 * @since 0.1.0
 * @stability experimental
 */
export interface DescribeToolsOptions {
  /**
   * Which procedures become tools: those with `mcp` meta, every query and
   * mutation, or those a predicate picks. `mcp: false` always hides one,
   * and subscriptions and streamed outputs are never tools.
   * @default 'meta'
   */
  readonly include?:
    | 'meta'
    | 'all'
    | ((info: McpToolInfo) => boolean)
    | undefined;
  /**
   * Joins path segments into a tool's default name. Not `.`: clients pass
   * tools on to model APIs that accept only `[A-Za-z0-9_-]` in names.
   * @default '_'
   */
  readonly separator?: string | undefined;
}

/** A tool and how to call its procedure. @internal */
export interface ToolEntry {
  readonly tool: McpTool;
  readonly path: string;
  readonly procedure: AnyProcedure;
  /** The input isn't an object, so it travels as `{ input }`. */
  readonly wrapInput: boolean;
  /** The procedure takes no input, so the arguments are ignored. */
  readonly noInput: boolean;
  /** The output isn't an object, so `structuredContent` is `{ result }`. */
  readonly wrapOutput: boolean;
}

const isObjectSchema = (schema: JsonSchema): boolean =>
  typeof schema === 'object' &&
  (schema['type'] === 'object' ||
    (Array.isArray(schema['allOf']) &&
      schema['allOf'].every((s: JsonSchema) => isObjectSchema(s))));

/** `schema` passed {@link isObjectSchema}, so it's an object. */
const asObject = (schema: JsonSchema): McpObjectSchema => ({
  ...(schema as object),
  type: 'object',
});

const isIncluded = (
  include: NonNullable<DescribeToolsOptions['include']>,
  info: McpToolInfo,
  flag: McpMeta['mcp'],
): boolean => {
  if (flag === false) return false;
  if (include === 'all') return true;
  if (include === 'meta') return flag !== undefined;
  return include(info);
};

const idempotentMethods = new Set(['PUT', 'DELETE']);

function toolOf(
  name: string,
  path: string,
  type: ProcedureType,
  json: ProcedureJson,
  own: McpToolMeta,
  wrapInput: boolean,
  wrapOutput: boolean,
): McpTool {
  const route = json.route;
  const title = own.title ?? route?.summary;
  const description = own.description ?? route?.description ?? route?.summary;
  const errors = Object.keys(json.errors ?? {});
  let inputSchema: McpObjectSchema = { type: 'object', properties: {} };
  if (json.input !== undefined) {
    inputSchema = wrapInput
      ? {
          type: 'object',
          properties: { input: json.input },
          required: ['input'],
        }
      : asObject(json.input);
  }
  let outputSchema: McpObjectSchema | undefined;
  if (json.output !== undefined) {
    // No `required`: an `undefined` result is `{}`.
    outputSchema = wrapOutput
      ? { type: 'object', properties: { result: json.output } }
      : asObject(json.output);
  }
  const idempotent =
    type === 'query' || idempotentMethods.has(route?.method ?? '');
  return {
    name,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    annotations: {
      readOnlyHint: type === 'query',
      ...(idempotent ? { idempotentHint: true } : {}),
      ...own.annotations,
    },
    ...(own.icons ? { icons: own.icons } : {}),
    _meta: {
      'io.trpc/path': path,
      'io.trpc/type': type,
      ...(errors.length ? { 'io.trpc/errors': errors } : {}),
    },
  };
}

/**
 * The tools a loaded router publishes. Throws when two procedures map to
 * one tool name. @internal
 */
export function describeEntries(
  router: object,
  opts: DescribeToolsOptions = {},
): ToolEntry[] {
  const flat = assertLoaded(flattenRoutes(router));
  const include = opts.include ?? 'meta';
  const separator = opts.separator ?? '_';
  const entries: ToolEntry[] = [];
  const names = new Map<string, string>();
  for (const leaf of flat.procedures) {
    const path = leaf.path;
    const def = leaf.procedure['~trpc'];
    const flag = (def.meta as McpMeta).mcp;
    const info: McpToolInfo = { path, type: def.type, meta: def.meta };
    if (def.type === 'subscription' || isStreamSchema(def.output)) continue;
    if (!isIncluded(include, info, flag)) continue;
    const own = typeof flag === 'object' ? flag : {};
    const name = own.name ?? path.split('.').join(separator);
    const clash = names.get(name);
    if (clash) {
      throw new Error(`MCP: "${path}" and "${clash}" are both tool "${name}"`);
    }
    names.set(name, path);

    const json = procedureJson(def, routeOf(def));
    const wrapInput = json.input !== undefined && !isObjectSchema(json.input);
    const wrapOutput =
      json.output !== undefined && !isObjectSchema(json.output);
    entries.push({
      tool: toolOf(name, path, def.type, json, own, wrapInput, wrapOutput),
      path,
      procedure: leaf.procedure,
      wrapInput,
      noInput: !def.steps.some((s) => s.kind === 'input'),
      wrapOutput,
    });
  }
  return entries;
}

/**
 * The MCP tools a router publishes, as `tools/list` sends them: names,
 * descriptions, annotations, and input and output JSON Schemas from the
 * procedures' schemas (Standard JSON Schema, as the OpenAPI generator reads
 * them). For agent frameworks that take MCP-shaped tools, or a server of
 * your own.
 *
 * Throws on a lazy subtree that hasn't loaded (pass `await
 * loadRouter(router)`), and when two procedures map to one tool name.
 *
 * @example
 * ```ts
 * const tools = experimental_describeTools(appRouter);
 * // [{ name: 'post_byId', description: 'Read one blog post by its id.', inputSchema: { type: 'object', … }, … }]
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_describeTools(
  router: object,
  opts?: DescribeToolsOptions,
): McpTool[] {
  return describeEntries(router, opts).map((e) => e.tool);
}
