/**
 * The APIs `.agent-docs/open/mcp-tool-errors.md` proposes, as types: A's
 * `mcp` root extension, whose procedures fail as `isError` results. B
 * changes only what the agent's client gets, so it has no code.
 */
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ProcedureBuilder, RootDef } from '@trpc12/trpc/server';

export interface McpToolMetaA {
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly annotations?: ToolAnnotations;
}

export interface McpMetaA {
  mcp?: McpToolMetaA | boolean;
}

/** A: `initTrpc().concat(experimental_mcp())` adds the `mcp` meta key. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;
