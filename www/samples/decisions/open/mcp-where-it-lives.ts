/**
 * The APIs `.agent-docs/open/mcp-where-it-lives.md` proposes, as types: A's
 * `@trpc12/trpc/mcp` root extension and handler, B's
 * `@trpc12/experimental-mcp` package that makes an SDK `McpServer`, and C's
 * `experimental_describeTools()` for a hand-wired SDK `Server`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
  AnyRouter,
  inferRouterContext,
  ProcedureBuilder,
  RootDef,
} from '@trpc12/trpc/server';

type CreateContext<TRouter extends AnyRouter> = (opts: {
  request: Request;
}) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export interface McpMetaA {
  mcp?:
    | {
        readonly name?: string;
        readonly title?: string;
        readonly description?: string;
        readonly annotations?: ToolAnnotations;
      }
    | boolean;
}

/** A: `@trpc12/trpc/mcp`'s root extension, adding the `mcp` meta key. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;

/** A: MCP over Streamable HTTP, on the handler core. */
export declare function experimental_createMcpHandlerA<
  TRouter extends AnyRouter,
>(opts: {
  readonly router: TRouter;
  readonly serverInfo?: { readonly name: string; readonly version: string };
  readonly createContext?: CreateContext<TRouter>;
}): {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<Tool>;
};

/** B: `@trpc12/experimental-mcp`, one SDK tool per procedure. */
export declare function createMcpServerB<TRouter extends AnyRouter>(opts: {
  readonly router: TRouter;
  readonly createContext?: CreateContext<TRouter>;
}): McpServer;

/** C: the tools `tools/list` sends, for an SDK `Server` the app wires. */
export declare function experimental_describeToolsC(router: AnyRouter): Tool[];
