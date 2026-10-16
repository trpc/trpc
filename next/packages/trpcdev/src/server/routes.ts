import type { Context, Layer } from 'effect';
import { Effect } from 'effect';
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
  /** Routes serve this path and those under it; without one, every path. */
  readonly endpoint: string | undefined;
  /** Serves WebSocket upgrades to the endpoint. */
  readonly webSocket?:
    | ((
        ws: WebSocketLike,
        request: HttpServerRequest.HttpServerRequest,
      ) => void)
    | undefined;
}): HttpParts {
  const wrap = (app: App) =>
    opts.middleware.reduceRight<App>((inner, m) => m(inner), app);
  const { webSocket, endpoint } = opts;
  const route = wrap(
    webSocket
      ? Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          if (!isUpgrade(request)) return yield* opts.app;
          const { pathname } = new URL(request.url, 'http://localhost');
          if (
            endpoint !== undefined &&
            pathname !== endpoint &&
            pathname !== `${endpoint}/`
          ) {
            return HttpServerResponse.empty({ status: 404 });
          }
          yield* upgradeTo(request, (ws) => webSocket(ws, request));
          return HttpServerResponse.empty();
        })
      : opts.app,
  );
  // `/trpc/*` also matches `/trpc`.
  const routes =
    endpoint === undefined || endpoint === '/'
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
