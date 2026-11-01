import {
  Context,
  Effect,
  Scope,
  type Duration,
  type Layer,
  type ManagedRuntime,
} from 'effect';
import type {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
} from 'effect/http';
import type { AnyTrpcError } from '../../internal/error.ts';
import type {
  MaybePromise,
  ProcedureType,
  TypeError,
} from '../../internal/types.ts';
import type { AnyTransformer } from '../../transformer/index.ts';
import {
  checkRouterKeys,
  type AnyRouter,
  type inferRouterContext,
  type RootRouterCheck,
  type inferRouterServices,
} from '../procedures/index.ts';
import {
  HandlerDrains,
  makeSocketDrains,
  SocketCore,
  UpgradeServer,
  type MessagePortLike,
  type Transport,
  type WebSocketLike,
} from '../sockets/index.ts';
import { HttpApp, makeApp } from './app.ts';
import { createHandlerCore } from './core.ts';
import { setHandlerContext } from './handler-context.ts';
import { makeHttpHandler } from './http-handler.ts';
import { CurrentPlatform } from './platform.ts';
import { httpParts } from './routes.ts';
import { makeSessions } from './sessions.ts';

/**
 * What `createContext` receives.
 * @since 0.1.0
 * @stability stable
 */
export interface CreateContextOpts<TPlatform = undefined> {
  /**
   * The HTTP request, or the upgrade request of a WebSocket, as Effect's
   * `HttpServerRequest`: `request.headers` is a record of lowercase names
   * (`request.headers.cookie`), and on fetch runtimes `request.source` is
   * the web `Request`. For a MessagePort, the `request` passed to
   * `handler.messagePort()`, or a placeholder `http://localhost/` request.
   */
  readonly request: HttpServerRequest.HttpServerRequest;
  /**
   * What the runtime passed `handler.fetch(request, platform)` or
   * `handler.websocket(socket, { request, platform })`: Workers' `env` and
   * `ctx`, say. `undefined` under `serve()`, Node and Bun.
   */
  readonly platform: TPlatform;
  readonly info: {
    /** Every call in the request: one, or several for a batch. */
    readonly calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
    readonly signal: AbortSignal;
    readonly transport: Transport;
    /** What a WebSocket or MessagePort client sent as `connectionParams`. */
    readonly connectionParams: Record<string, unknown> | undefined;
  };
}

/**
 * What `onError` receives. `error.cause` holds the original thrown value.
 * @since 0.1.0
 * @stability stable
 */
export interface OnErrorOpts {
  readonly error: AnyTrpcError;
  readonly path: string | undefined;
  readonly type: ProcedureType | undefined;
  readonly request: HttpServerRequest.HttpServerRequest;
}

/**
 * `createContext`, required when the router's procedures need ctx.
 * @since 0.1.0
 * @stability stable
 */
export type ContextOption<TCtx, TPlatform = undefined> = {} extends TCtx
  ? {
      /** Runs once per request (once per batch). */
      createContext?: (
        opts: CreateContextOpts<TPlatform>,
      ) => MaybePromise<TCtx>;
    }
  : {
      /** Runs once per request (once per batch). */
      createContext: (opts: CreateContextOpts<TPlatform>) => MaybePromise<TCtx>;
    };

/**
 * The platform argument `fetch()` takes: none without a platform type (so
 * `handler.fetch` fits Next's route handler type), optional when the type
 * allows `undefined`, required otherwise.
 * @since 0.1.0
 * @stability stable
 */
export type PlatformArgs<TPlatform> = [TPlatform] extends [undefined]
  ? []
  : undefined extends TPlatform
    ? [platform?: TPlatform]
    : [platform: TPlatform];

/**
 * The `platform` field of `websocket()` and `messagePort()` options.
 * @since 0.1.0
 * @stability stable
 */
export type PlatformField<TPlatform> = undefined extends TPlatform
  ? { platform?: TPlatform }
  : { platform: TPlatform };

/**
 * `layer`, required when the router's procedures need Effect services
 * and no `runtime` is given. The handler builds it on first use and
 * `dispose()` releases it.
 * @since 0.1.0
 * @stability stable
 */
export type LayerOption<TServices> = ([TServices] extends [never]
  ? { layer?: Layer.Layer<never, any, never> }
  : {
      /** Provides the Effect services the router's procedures need. */
      layer: Layer.Layer<TServices, any, never>;
    }) & { runtime?: undefined };

/**
 * `runtime`, required when the router's procedures need Effect services. The
 * caller owns it: calls read its services, and `runtime.dispose()` (or
 * `await using`) runs the layer's finalizers. Handlers take it instead of
 * `layer`, so a server and `createRouterClient` share one build, and their
 * `dispose()` leaves it running. Where only `runtime` is taken
 * (`createRouterClient`), `layer` is a type error that names the fix.
 * @since 0.1.0
 * @stability stable
 */
export type RuntimeOption<TServices> = ([TServices] extends [never]
  ? { runtime?: ManagedRuntime.ManagedRuntime<never, unknown> | undefined }
  : {
      /** Provides the Effect services the router's procedures need. */
      runtime: ManagedRuntime.ManagedRuntime<TServices, unknown>;
    }) & {
  layer?: TypeError<'pass `runtime: ManagedRuntime.make(layer)` instead of `layer`, and dispose the runtime when done'>;
};

/**
 * The handler's `transformer` option.
 * @since 0.1.0
 * @stability stable
 */
export interface TransformerOption {
  /**
   * The wire format. Links must use the same one; a link with another fails
   * with an error naming both (`trpc-transformer` header). Client types
   * follow the link's transformer.
   * @default jsonTransformer
   */
  transformer?: AnyTransformer | undefined;
}

/**
 * Options shared by every handler.
 * @since 0.1.0
 * @stability stable
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter & RootRouterCheck<TRouter>;
  /**
   * The path prefix procedures are served under.
   * @default '/trpc'
   */
  endpoint?: string;
  /**
   * Accept batched requests (opt-in, 10).
   * @default false
   */
  batch?: boolean | { maxItems?: number };
  /**
   * Max request body size, in bytes.
   * @default 1_048_576
   */
  maxBodySize?: number;
  /**
   * Send the real message of unexpected errors to the client.
   * @default true only when `NODE_ENV` is `development` or `test`
   */
  exposeUnexpectedErrors?: boolean;
  /** Called for every error, with the original cause. */
  onError?: (opts: OnErrorOpts) => void;
  /**
   * Effect HTTP middleware around the handler, outermost first: CORS,
   * logging, rate limits. `@trpc12/trpc/http`'s `cors()` also checks the
   * origin of WebSocket upgrades.
   *
   * @example
   * ```ts
   * createFetchHandler({
   *   router,
   *   middleware: [cors({ allowedOrigins: ['https://app.example.com'] }), HttpMiddleware.logger],
   * });
   * ```
   */
  middleware?: ReadonlyArray<HttpMiddleware.HttpMiddleware>;
  sse?: {
    /**
     * Send a comment line this often while a subscription is quiet, so
     * proxies don't close it as idle. `false` sends none.
     * @default '15 seconds'
     */
    pingInterval?: Duration.Input | false;
  };
  websocket?: {
    /**
     * Close a WebSocket that sends nothing, `wsLink`'s pings included, for
     * this long, and stop its subscriptions. The close code is 1001, so a
     * live client reconnects. `false` keeps silent sockets open.
     * @default '60 seconds'
     */
    idleTimeout?: Duration.Input | false;
    /**
     * How long `dispose()`, a `drain()` without `timeout` and the end of
     * `serve()` give connections to move before closing them. `dispose()`
     * also waits this long for the requests `fetch` is serving.
     * @default '10 seconds'
     */
    drainTimeout?: Duration.Input;
    /**
     * Upgrades a WebSocket request that reaches `handler.fetch`, on runtimes
     * that upgrade a web `Request` themselves: `Deno.upgradeWebSocket`. The
     * upgrade runs inside `middleware`, so `cors()` refuses one from another
     * origin with a `403` before the socket opens. Without it, upgrade
     * requests to `fetch` are served as HTTP calls.
     *
     * @example
     * ```ts
     * const handler = createFetchHandler({ router, websocket: { upgrade: Deno.upgradeWebSocket } });
     * Deno.serve((request) => handler.fetch(request));
     * ```
     */
    upgrade?: (request: Request) => {
      socket: WebSocketLike;
      response: Response;
    };
  };
}

/**
 * The options of {@link createFetchHandler}.
 * @since 0.1.0
 * @stability stable
 */
export type FetchHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  (
    | LayerOption<inferRouterServices<TRouter>>
    | RuntimeOption<inferRouterServices<TRouter>>
  ) &
  TransformerOption;

/**
 * The options of {@link makeFetchHandler}: those of
 * {@link createFetchHandler} without `layer` or `runtime`, since the
 * services come from the Effect that makes the handler.
 * @since 0.1.0
 * @stability stable
 */
export type MakeFetchHandlerOptions<
  TRouter extends AnyRouter,
  TPlatform = undefined,
> = BaseHandlerOptions<TRouter> &
  ContextOption<inferRouterContext<TRouter>, TPlatform> &
  TransformerOption;

/**
 * A web-standard request handler.
 * @since 0.1.0
 * @stability stable
 */
export interface FetchHandler<TPlatform = undefined> {
  /**
   * Handles one HTTP request. `platform` reaches `createContext`.
   *
   * @example
   * ```ts
   * // Cloudflare Workers
   * export default {
   *   fetch: (request, env, ctx) => handler.fetch(request, { env, ctx }),
   * } satisfies ExportedHandler<Env>;
   * ```
   */
  readonly fetch: (
    request: Request,
    ...platform: PlatformArgs<TPlatform>
  ) => Promise<Response>;
  /**
   * Serves calls over an accepted WebSocket. `request` is the
   * upgrade request; `createContext` receives it. The upgrade already
   * happened, so `middleware` doesn't run: on Deno, prefer
   * `websocket.upgrade`, which upgrades inside it.
   *
   * @example
   * ```ts
   * const { socket, response } = Deno.upgradeWebSocket(request);
   * handler.websocket(socket, { request });
   * return response;
   * ```
   */
  websocket(
    socket: WebSocketLike,
    opts: { request: Request } & PlatformField<TPlatform>,
  ): void;
  /**
   * Serves calls over a `MessagePort`, `Worker` or `worker_threads` port.
   *
   * @example
   * ```ts
   * // in a worker
   * handler.messagePort(parentPort);
   * ```
   */
  messagePort(
    port: MessagePortLike,
    ...opts: undefined extends TPlatform
      ? [opts?: { request?: Request; platform?: TPlatform }]
      : [opts: { request?: Request; platform: TPlatform }]
  ): void;
  /**
   * The handler as `effect/http` routes for its endpoint and the paths
   * under it, WebSocket upgrades included. Merge them with your own routes
   * and serve them with `HttpRouter.serve`.
   *
   * @example
   * ```ts
   * const app = Layer.mergeAll(
   *   handler.routes,
   *   HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
   * );
   * HttpRouter.serve(app).pipe(
   *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
   *   Layer.launch,
   *   NodeRuntime.runMain,
   * );
   * ```
   */
  readonly routes: Layer.Layer<never, never, HttpRouter.HttpRouter>;
  /**
   * Drains the open WebSocket, socket and MessagePort connections, for a
   * rolling deploy. Each WebSocket or socket client gets a `reconnect`
   * message: `wsLink` sends new calls on a new connection, moves its
   * subscriptions there from their last `tracked()` id, and closes the old
   * connection once the calls it sent settle. A MessagePort is closed once
   * its calls settle. At `timeout` the handler closes what's left (1012,
   * "service restart"), interrupting its calls. During the drain, upgrades
   * get a 503 and sockets handed to `websocket()` are closed (1012), so
   * clients reconnect elsewhere; after it, the handler takes connections
   * again. `serve()` drains when its layer is released, and refuses
   * upgrades until the server has stopped.
   *
   * @example
   * ```ts
   * process.once('SIGTERM', async () => {
   *   await handler.drain({ timeout: '20 seconds' });
   *   server.close();
   * });
   * ```
   */
  drain(opts?: {
    /** @default the handler's `websocket.drainTimeout` */
    timeout?: Duration.Input;
  }): Promise<void>;
  /**
   * Ends what the handler started. Event streams (SSE subscriptions) end
   * at once, and their clients reconnect. Then, within
   * `websocket.drainTimeout`, it drains the connections (`drain()`) and
   * waits for the requests `fetch` is serving, streamed bodies included.
   * What's left is interrupted: a request still running gets a 503. Last,
   * it releases the `layer`'s resources; a `runtime` you passed is yours
   * to dispose. The handler takes no connections after. Calling it again
   * waits for the first call.
   */
  dispose(): Promise<void>;
  /** `dispose()`, for `await using`. */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Serves a router over the web-standard `fetch` interface. Works on
 * any runtime with `Request`/`Response`; `@trpc12/trpc/http` serves it with
 * Effect's `HttpServer` on Node, Bun and the rest. Underneath it's an
 * `effect/http` app: `middleware` wraps it, and `createContext` gets the
 * `HttpServerRequest`.
 *
 * @example
 * ```ts
 * const handler = createFetchHandler({
 *   router: appRouter,
 *   createContext: ({ request }) => ({ user: getUser(request.headers.cookie) }),
 *   layer: PostRepo.Live, // Effect services, when procedures need any
 * });
 * export default { fetch: handler.fetch };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createFetchHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(opts: FetchHandlerOptions<TRouter, TPlatform>): FetchHandler<TPlatform> {
  return buildFetchHandler(opts as BuildOptions, undefined)
    .handler as FetchHandler<TPlatform>;
}

/**
 * {@link createFetchHandler} as an Effect: the handler lives as long as
 * the `Scope`, whose end disposes it, and procedures read their services
 * from the Effect's context instead of a `layer`. Serve it with
 * `@trpc12/trpc/http`'s `serve()`.
 *
 * @example
 * ```ts
 * const live = Layer.unwrap(
 *   Effect.map(makeFetchHandler({ router: appRouter }), serve),
 * ).pipe(
 *   Layer.provide(PostRepo.Live),
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function makeFetchHandler<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: MakeFetchHandlerOptions<TRouter, TPlatform>,
): Effect.Effect<
  FetchHandler<TPlatform>,
  never,
  Scope.Scope | inferRouterServices<TRouter>
> {
  return Effect.map(
    Effect.acquireRelease(
      Effect.map(Effect.context<inferRouterServices<TRouter>>(), (services) =>
        buildFetchHandler(
          opts as BuildOptions,
          Context.omit(Scope.Scope)(services),
        ),
      ),
      (built) => built.close,
    ),
    (built) => built.handler,
  ) as Effect.Effect<
    FetchHandler<TPlatform>,
    never,
    Scope.Scope | inferRouterServices<TRouter>
  >;
}

type BuildOptions = FetchHandlerOptions<AnyRouter, unknown> & {
  createContext?: (o: CreateContextOpts<any>) => MaybePromise<object>;
  layer?: Layer.Layer<any, any, never>;
  runtime?: ManagedRuntime.ManagedRuntime<never, unknown> | undefined;
};

function buildFetchHandler(
  opts: BuildOptions,
  services: Context.Context<any> | undefined,
): { handler: FetchHandler<unknown>; close: Effect.Effect<void> } {
  checkRouterKeys(opts.router);
  const drainTimeout = opts.websocket?.drainTimeout ?? '10 seconds';
  const drains = makeSocketDrains(drainTimeout);
  const base = createHandlerCore({ ...opts, services, drains, drainTimeout });
  const handler = makeHttpHandler(opts, base);
  const sessions = makeSessions(handler, drains, opts.websocket);
  const app = makeApp(handler);
  const middleware = opts.middleware ?? [];
  const http = httpParts({
    app,
    middleware,
    endpoint: handler.endpoint,
    serveWebSocket: sessions.serveWebSocket,
    upgradeWeb: sessions.upgradeWeb,
    refusing: drains.refusing,
    request: base.request,
  });

  const fetchHandler: FetchHandler<unknown> = {
    websocket: sessions.websocket,
    messagePort: sessions.messagePort,
    fetch: (request, platform) =>
      http.fetch(
        request,
        platform === undefined
          ? undefined
          : (Context.make(CurrentPlatform, platform) as Context.Context<never>),
      ),
    routes: http.routes,
    drain: (o) => Effect.runPromise(drains.drain({ timeout: o?.timeout })),
    dispose: base.dispose,
    [Symbol.asyncDispose]: base.dispose,
  };
  setHandlerContext(
    fetchHandler,
    Context.make(SocketCore, sessions.core).pipe(
      Context.add(HandlerDrains, drains),
      Context.add(UpgradeServer, sessions.serveWebSocket),
      Context.add(HttpApp, { app, middleware, endpoint: handler.endpoint }),
    ),
  );
  return { handler: fetchHandler, close: base.close };
}
