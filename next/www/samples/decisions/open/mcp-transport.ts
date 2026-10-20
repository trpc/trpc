/**
 * The APIs `.agent-docs/open/mcp-transport.md` proposes, as types: the MCP
 * handler under each transport. A and B take the same options (B only
 * answers some calls with an event stream), C adds `sessions`, D a stdio
 * entry point.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AnyRouter } from '@trpc12/trpc/server';

interface McpHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<Tool>;
}

/** A: one JSON-RPC message per POST, answered with JSON. */
export declare function experimental_createMcpHandlerA<
  TRouter extends AnyRouter,
>(opts: { readonly router: TRouter }): McpHandler;

/** B: A, where `tools/call` may answer with `text/event-stream`. */
export declare function experimental_createMcpHandlerB<
  TRouter extends AnyRouter,
>(opts: { readonly router: TRouter }): McpHandler;

/** C: where `Mcp-Session-Id` sessions live between requests. */
export interface McpSessionStoreC {
  get(id: string): Promise<unknown>;
  set(id: string, session: unknown): Promise<void>;
  delete(id: string): Promise<void>;
}

/** C: B, plus sessions and the GET stream. */
export declare function experimental_createMcpHandlerC<
  TRouter extends AnyRouter,
>(opts: {
  readonly router: TRouter;
  readonly sessions?: McpSessionStoreC;
}): McpHandler;

/** D: the handler of A. */
export declare function experimental_createMcpHandlerD<
  TRouter extends AnyRouter,
>(opts: { readonly router: TRouter }): McpHandler;

/** D: serves a handler over stdin and stdout, for a client that starts the process. */
export declare function experimental_serveStdioD(
  handler: McpHandler,
): Promise<void>;
