import type { Layer } from 'effect';
import { Context, Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import type { WebSocketLike } from './socket.ts';
import { isUpgrade, upgradeTo } from './upgrade.ts';

type App = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  any,
  HttpServerRequest.HttpServerRequest
>;

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
  readonly webSocket: (
    ws: WebSocketLike,
    request: HttpServerRequest.HttpServerRequest,
  ) => void;
}): HttpParts {
  const wrap = (app: App) =>
    opts.middleware.reduceRight<App>((inner, m) => m(inner), app);
  const { endpoint } = opts;
  const route = wrap(
    Effect.withFiber((fiber) => {
      const request = Context.get(
        fiber.context as Context.Context<HttpServerRequest.HttpServerRequest>,
        HttpServerRequest.HttpServerRequest,
      );
      if (!isUpgrade(request)) return opts.app;
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== endpoint && url.pathname !== `${endpoint}/`) {
        return Effect.succeed(HttpServerResponse.empty({ status: 404 }));
      }
      return Effect.as(
        upgradeTo(request, (ws) => opts.webSocket(ws, request)),
        HttpServerResponse.empty(),
      );
    }),
  );
  // `/trpc/*` also matches `/trpc`.
  const routes =
    endpoint === '/'
      ? HttpRouter.add('*', '*', route)
      : HttpRouter.add('*', `${endpoint as `/${string}`}/*`, route);
  // Fetch runtimes upgrade WebSockets themselves, through `handler.websocket`.
  const web = HttpRouter.toWebHandler(
    HttpRouter.add('*', '*', wrap(opts.app)),
    { disableLogger: true },
  );
  return {
    routes: routes as HttpParts['routes'],
    fetch: (request, context) =>
      (web.handler as HttpParts['fetch'])(request, context),
    dispose: web.dispose,
  };
}
