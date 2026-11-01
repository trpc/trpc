/**
 * The APIs `.agent-docs/open/mcp-non-json-values.md` proposes, as types:
 * B's `mcp` root extension, which decodes Effect Schema arguments with their
 * JSON codec, and C's per-tool schema overrides. A is today's input schemas.
 */
import type { JsonSchema } from '@trpc12/trpc/openapi';
import type { ProcedureBuilder, RootDef } from '@trpc12/trpc/server';

export interface McpMetaB {
  mcp?: { readonly description?: string } | boolean;
}

/** B: the same `mcp` meta key; arguments are decoded by the input schema's JSON codec. */
export declare function experimental_mcpB(): ProcedureBuilder<
  RootDef<{}, McpMetaB>
>;

export interface McpToolMetaC {
  readonly description?: string;
  /** Replaces the generated `inputSchema`. */
  readonly inputSchema?: (generated: JsonSchema) => JsonSchema;
  /** Replaces the generated `outputSchema`. */
  readonly outputSchema?: (generated: JsonSchema) => JsonSchema;
}

export interface McpMetaC {
  mcp?: McpToolMetaC | boolean;
}

/** C: the `mcp` meta key with `inputSchema` and `outputSchema`. */
export declare function experimental_mcpC(): ProcedureBuilder<
  RootDef<{}, McpMetaC>
>;
