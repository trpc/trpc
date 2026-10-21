import {
  type ProcedureBuilder,
  initTrpc,
  type RootDef,
} from '../server/procedures/index.ts';

/**
 * MCP's tool annotations: hints for the client about what a tool does, not
 * guarantees.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpToolAnnotations {
  readonly title?: string;
  /** @default `true` for queries */
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  /** @default `true` for queries, and for mutations routed as `PUT` or `DELETE` */
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/**
 * An icon a client may show beside the tool (MCP `2025-11-25`).
 * @since 0.1.0
 * @stability experimental
 */
export interface McpIcon {
  readonly src: string;
  readonly mimeType?: string;
  readonly sizes?: ReadonlyArray<string>;
  readonly theme?: 'light' | 'dark';
}

/**
 * How a procedure is published as a tool, the object form of `mcp` meta.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpToolMeta {
  /** @default the path joined with the handler's `separator`: `post_byId` */
  readonly name?: string;
  /** @default `route.summary` */
  readonly title?: string;
  /** What the model reads to pick the tool. @default `route.description`, else `route.summary` */
  readonly description?: string;
  /** Merged hint by hint across `.meta()` calls and over the defaults. */
  readonly annotations?: McpToolAnnotations;
  readonly icons?: ReadonlyArray<McpIcon>;
}

/**
 * The meta key {@link experimental_mcp} adds.
 * @since 0.1.0
 * @stability experimental
 */
export interface McpMeta {
  /**
   * `true` or an object publishes the procedure as a tool; `false` hides it,
   * even from a handler with `include: 'all'`.
   */
  mcp?: McpToolMeta | boolean;
}

const mergeTool = (
  before: McpToolMeta | boolean,
  next: McpToolMeta | boolean,
): McpToolMeta | boolean =>
  typeof before === 'object' && typeof next === 'object'
    ? {
        ...before,
        ...next,
        annotations: { ...before.annotations, ...next.annotations },
      }
    : next;

/**
 * The MCP root extension: adds the `mcp` meta key, which publishes a
 * procedure as a tool of {@link experimental_createMcpHandler}. `.meta({ mcp })`
 * calls merge key by key, and `annotations` hint by hint.
 *
 * @example
 * ```ts
 * const t = initTrpc<{ ctx: Context }>().concat(experimental_mcp());
 *
 * export const byId = t.procedure
 *   .meta({ mcp: { description: 'Read one blog post by its id.' } })
 *   .input(z.object({ id: z.string() }))
 *   .query(({ input }) => db.post.find(input.id));
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_mcp(): ProcedureBuilder<RootDef<{}, McpMeta>> {
  return initTrpc<{ meta: McpMeta }>({ mergeMeta: { mcp: mergeTool } })
    .procedure;
}
