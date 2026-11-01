/**
 * The APIs `.agent-docs/open/mcp-streamed-procedures.md` proposes, as types:
 * the `mcp` meta key under each option. A leaves subscriptions out of
 * `tools/list`, B adds `maxItems`, C a `resource`, D `task`.
 */
import type { ProcedureBuilder, RootDef } from '@trpc12/trpc/server';

interface McpToolMeta {
  readonly name?: string;
  readonly description?: string;
}

export interface McpMetaA {
  /** Ignored on a subscription, which is never a tool. */
  mcp?: McpToolMeta | boolean;
}

/** A: the `mcp` meta key; subscriptions and streamed outputs aren't tools. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;

export interface McpMetaB {
  mcp?:
    | (McpToolMeta & {
        /** Ends the call after this many items. */
        readonly maxItems?: number;
      })
    | boolean;
}

/** B: a streamed call runs to completion, with `notifications/progress` per item. */
export declare function experimental_mcpB(): ProcedureBuilder<
  RootDef<{}, McpMetaB>
>;

export interface McpMetaC {
  mcp?:
    | (McpToolMeta & {
        /** A subscription becomes a resource the agent reads and subscribes to. */
        readonly resource?: { readonly uri: string };
      })
    | boolean;
}

/** C: `mcp.resource`, with `resources/subscribe`. */
export declare function experimental_mcpC(): ProcedureBuilder<
  RootDef<{}, McpMetaC>
>;

export interface McpMetaD {
  mcp?:
    | (McpToolMeta & {
        /** `tools/call` answers with a task id the agent polls with `tasks/get`. */
        readonly task?: boolean;
      })
    | boolean;
}

/** D: `mcp.task`, stored by `experimental_durable()`. */
export declare function experimental_mcpD(): ProcedureBuilder<
  RootDef<{}, McpMetaD>
>;
