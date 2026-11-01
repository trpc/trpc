/**
 * The APIs `.agent-docs/open/mcp-tool-names.md` proposes, as types: A's
 * `mcp.name` override and handler `separator`, and C's `mcp` meta where
 * `name` is required. B names tools by their path, with nothing to write.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AnyRouter, ProcedureBuilder, RootDef } from '@trpc12/trpc/server';

export interface McpToolMetaA {
  /** @default the path joined with the handler's `separator` */
  readonly name?: string;
  readonly description?: string;
}

export interface McpMetaA {
  mcp?: McpToolMetaA | boolean;
}

/** A: the `mcp` meta key, with an optional `name`. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;

/** A: throws when two procedures map to one tool name. */
export declare function experimental_createMcpHandlerA<
  TRouter extends AnyRouter,
>(opts: {
  readonly router: TRouter;
  /** Joins path segments into the default name. @default '_' */
  readonly separator?: string;
}): {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<Tool>;
};

export interface McpToolMetaC {
  readonly name: string;
  readonly description?: string;
}

export interface McpMetaC {
  /** An object publishes the procedure; `false` hides it. */
  mcp?: McpToolMetaC | false;
}

/** C: the `mcp` meta key, where every published procedure names its tool. */
export declare function experimental_mcpC(): ProcedureBuilder<
  RootDef<{}, McpMetaC>
>;
