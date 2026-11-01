/**
 * The APIs `.agent-docs/open/mcp-which-procedures.md` proposes, as types: A
 * publishes procedures marked with `mcp` meta (or `include`), B publishes
 * every query and mutation unless `mcp: false`, C takes a map of tools.
 */
import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
  AnyProcedure,
  AnyRouter,
  ProcedureBuilder,
  ProcedureType,
  RootDef,
} from '@trpc12/trpc/server';

interface McpHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<Tool>;
}

interface McpToolMeta {
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly annotations?: ToolAnnotations;
}

export interface McpMetaA {
  /** `true` or an object publishes the procedure; `false` hides it even with `include: 'all'`. */
  mcp?: McpToolMeta | boolean;
}

/** A: the `mcp` meta key; only procedures that set it are tools. */
export declare function experimental_mcpA(): ProcedureBuilder<
  RootDef<{}, McpMetaA>
>;

export interface ToolInfoA {
  readonly path: string;
  readonly type: ProcedureType;
  readonly meta: object;
}

/** A: `include` widens which procedures are tools. */
export declare function experimental_createMcpHandlerA<
  TRouter extends AnyRouter,
>(opts: {
  readonly router: TRouter;
  /** @default 'meta' */
  readonly include?: 'meta' | 'all' | ((info: ToolInfoA) => boolean);
}): McpHandler;

export interface McpMetaB {
  /** Describes a tool; `false` hides the procedure. */
  mcp?: McpToolMeta | false;
}

/** B: the `mcp` meta key; every query and mutation is a tool unless `mcp: false`. */
export declare function experimental_mcpB(): ProcedureBuilder<
  RootDef<{}, McpMetaB>
>;

/** B: publishes the whole router. */
export declare function experimental_createMcpHandlerB<
  TRouter extends AnyRouter,
>(opts: { readonly router: TRouter }): McpHandler;

/** C: the tools by name, with no meta. */
export declare function experimental_createMcpHandlerC<
  TRouter extends AnyRouter,
>(opts: {
  readonly router: TRouter;
  readonly tools: Readonly<Record<string, AnyProcedure>>;
}): McpHandler;
