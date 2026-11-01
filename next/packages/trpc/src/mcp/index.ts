/**
 * MCP (`@trpc12/trpc/mcp`, 25): publish a router's procedures as Model
 * Context Protocol tools, so agents (Claude, Cursor, ChatGPT, the MCP
 * Inspector) call them with the router's schemas, middleware and errors.
 * Speaks MCP's stateless Streamable HTTP itself, with no SDK.
 *
 * @example
 * ```ts
 * import { experimental_createMcpHandler, experimental_mcp } from '@trpc12/trpc/mcp';
 *
 * const t = initTrpc().concat(experimental_mcp());
 * const appRouter = t.router({
 *   post: {
 *     byId: t.procedure
 *       .meta({ mcp: { description: 'Read one blog post by its id.' } })
 *       .input(z.object({ id: z.string() }))
 *       .query(…),
 *   },
 * });
 * export const mcp = experimental_createMcpHandler({ router: appRouter });
 * // POST /mcp tools/call { name: 'post_byId', arguments: { id: '1' } }
 * ```
 * @see ../../../../.agent-docs/proposals/25-mcp.md
 * @module
 */
export {
  experimental_mcp,
  type McpIcon,
  type McpMeta,
  type McpToolAnnotations,
  type McpToolMeta,
} from './extension.ts';
export {
  experimental_describeTools,
  type DescribeToolsOptions,
  type McpObjectSchema,
  type McpTool,
  type McpToolInfo,
} from './tools.ts';
export {
  experimental_createMcpHandler,
  type BaseMcpHandlerOptions,
  type McpHandler,
  type McpHandlerOptions,
} from './handler.ts';
