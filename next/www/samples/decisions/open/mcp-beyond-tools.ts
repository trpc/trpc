/**
 * The APIs `.agent-docs/open/mcp-beyond-tools.md` proposes, as types: A's
 * tools-only `mcp` meta, B's `resource`, C's MCP client link and contract
 * generator, and D's `prompt`.
 */
import type { experimental_openApiLink } from '@trpc12/trpc/openapi';
import type { ProcedureBuilder, RootDef } from '@trpc12/trpc/server';

interface McpToolMeta {
  readonly name?: string;
  readonly description?: string;
}

export interface McpMetaA {
  mcp?: McpToolMeta | boolean;
}

/** A: the `mcp` meta key publishes tools, nothing else. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;

export interface McpMetaB {
  mcp?:
    | (McpToolMeta & {
        /** Serves an input-less query at `resources/read`. */
        readonly resource?: {
          readonly uri: string;
          readonly mimeType?: string;
        };
      })
    | boolean;
}

/** B: `mcp.resource`. */
export declare function experimental_mcpB(): ProcedureBuilder<
  RootDef<{}, McpMetaB>
>;

/** C: calls an MCP server's tools, as `experimental_openApiLink` calls REST endpoints. */
export declare function experimental_mcpLinkC(opts: {
  readonly url: string | URL;
}): ReturnType<typeof experimental_openApiLink>;

/**
 * C: a `@trpc12/trpc/contract` module for an MCP server's tools, from its
 * `tools/list`, as `experimental_generateContractFromOpenApi` does from a document.
 */
export declare function experimental_generateContractFromMcpC(opts: {
  readonly url: string | URL;
}): Promise<string>;

export interface McpMetaD {
  mcp?:
    | (McpToolMeta & {
        /** Served by `prompts/get`; `{id}` is an argument. */
        readonly prompt?: { readonly name: string; readonly template: string };
      })
    | boolean;
}

/** D: `mcp.prompt`. */
export declare function experimental_mcpD(): ProcedureBuilder<
  RootDef<{}, McpMetaD>
>;
