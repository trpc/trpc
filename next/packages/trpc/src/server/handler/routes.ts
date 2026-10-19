import { type Layer, Effect, type Context } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { isUpgrade, upgradeTo, type ServeSocket } from '../sockets/index.ts';

type App = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  any,
  HttpServerRequest.HttpServerRequest
>;

/**
 * `app` inside a handler's `middleware`, outermost first, so `cors()` sees
 * the WebSocket upgrades that go through it too. @internal
 */
export const withMiddleware = (
  middleware: ReadonlyArray<(app: App) => App>,
  app: App,
): App => middleware.reduceRight<App>((inner, m) => m(inner), app);

/**
 * A handler's `effect/http` side: its `HttpRouter` routes, and `fetch`
 * through `HttpRouter.toWebHandler`. @internal
 */
export interface HttpParts {
  readonly routes: Layer.Layer<never, never, HttpRouter.HttpRouter>;
  readonly fetch: (
    request: Request,
    context?: Context.Context<never>,
  ) => Promise<Response>;
  readonly dispose: () => Promise<void>;
}

/** @internal */
export function httpParts(opts: {
  readonly app: App;
  readonly middleware: ReadonlyArray<(app: App) => App>;
  /** Routes serve this path and those under it; `/` is every path. */
  readonly endpoint: string;
  /** Serves WebSocket upgrades to the endpoint. */
  readonly serveWebSocket: ServeSocket;
  /**
   * Upgrades a request that came through `fetch`, on runtimes whose
   * upgrade is a function of the web `Request` (Deno's
   * `upgradeWebSocket`). Without it, `fetch` serves no upgrades.
   */
  readonly upgradeWeb?:
    | ((request: HttpServerRequest.HttpServerRequest) => App)
    | undefined;
}): HttpParts {
  const wrap = (app: App) => withMiddleware(opts.middleware, app);
  const { endpoint } = opts;
  /** The middleware wrap upgrades too, so `cors()` can refuse them. */
  const upgrading = (
    upgrade: (request: HttpServerRequest.HttpServerRequest) => App,
  ) =>
    wrap(
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
        if (!isUpgrade(request)) return opts.app;
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname !== endpoint && url.pathname !== `${endpoint}/`) {
          return Effect.succeed(HttpServerResponse.empty({ status: 404 }));
        }
        return upgrade(request);
      }),
    );
  const route = upgrading((request) =>
    Effect.as(
      upgradeTo(request, (socket) => opts.serveWebSocket(socket, request)),
      HttpServerResponse.empty(),
    ),
  );
  // `/trpc/*` also matches `/trpc`.
  const routes =
    endpoint === '/'
      ? HttpRouter.add('*', '*', route)
      : HttpRouter.add('*', `${endpoint as `/${string}`}/*`, route);
  const web = HttpRouter.toWebHandler(
    HttpRouter.add(
      '*',
      '*',
      opts.upgradeWeb ? upgrading(opts.upgradeWeb) : wrap(opts.app),
    ),
    { disableLogger: true },
  );
  return {
    routes: routes as HttpParts['routes'],
    fetch: (request, context) =>
      (web.handler as HttpParts['fetch'])(request, context),
    dispose: web.dispose,
  };
}
