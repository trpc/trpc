/**
 * The APIs `.agent-docs/open/mcp-oauth.md` proposes, as types: A's handler
 * with `resourceMetadataUrl` and `filter`, B's metadata middleware on top of
 * it, and C's handler with no auth options.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AnyRouter, inferRouterContext } from '@trpc12/trpc/server';
import type { HttpMiddleware } from 'effect/http';

interface McpHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly tools: ReadonlyArray<Tool>;
}

interface CreateContext<TRouter extends AnyRouter> {
  /** Runs for each JSON-RPC request. */
  readonly createContext?: (opts: {
    request: Request;
  }) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
}

export interface McpHandlerOptionsA<
  TRouter extends AnyRouter,
> extends CreateContext<TRouter> {
  readonly router: TRouter;
  /** Sent in `WWW-Authenticate` when `createContext` throws `UNAUTHORIZED`. */
  readonly resourceMetadataUrl?: string;
  /** Hides tools per caller, in `tools/list` and `tools/call`. */
  readonly filter?: (opts: {
    tool: Tool;
    ctx: inferRouterContext<TRouter>;
  }) => boolean;
}

/** A: a 401 from `createContext`, and `filter`. */
export declare function experimental_createMcpHandlerA<
  TRouter extends AnyRouter,
>(opts: McpHandlerOptionsA<TRouter>): McpHandler;

export interface McpHandlerOptionsB<
  TRouter extends AnyRouter,
> extends McpHandlerOptionsA<TRouter> {
  /** Effect HTTP middleware around the handler, as on the OpenAPI handler. */
  readonly middleware?: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
}

/** B: A, plus `middleware`. */
export declare function experimental_createMcpHandlerB<
  TRouter extends AnyRouter,
>(opts: McpHandlerOptionsB<TRouter>): McpHandler;

/** B: serves RFC 9728's document at `/.well-known/oauth-protected-resource`. */
export declare function experimental_protectedResourceMetadataB(opts: {
  readonly resource: string;
  readonly authorizationServers: ReadonlyArray<string>;
  readonly scopesSupported?: ReadonlyArray<string>;
}): HttpMiddleware.HttpMiddleware;

/** C: no auth options; a `createContext` that throws is a JSON-RPC error. */
export declare function experimental_createMcpHandlerC<
  TRouter extends AnyRouter,
>(opts: { readonly router: TRouter } & CreateContext<TRouter>): McpHandler;
