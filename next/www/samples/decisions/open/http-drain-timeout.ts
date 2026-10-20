/**
 * The APIs `.agent-docs/open/http-drain-timeout.md` proposes, as types: B
 * adds a top-level `drainTimeout` for HTTP requests to `createFetchHandler`
 * beside `websocket.drainTimeout`, C moves `websocket.drainTimeout` up to a
 * top-level `drainTimeout`. A is `createFetchHandler` as it is.
 */
import type { Duration } from 'effect';
import type {
  AnyRouter,
  BaseHandlerOptions,
  FetchHandler,
  FetchHandlerOptions,
} from '@trpc12/trpc/server';

type Websocket = NonNullable<BaseHandlerOptions<AnyRouter>['websocket']>;

type WithWebsocket<O, W> = O extends unknown
  ? Omit<O, 'websocket'> & { websocket?: W }
  : never;

/** B: `drainTimeout` bounds the HTTP requests, `websocket.drainTimeout` the sockets. */
export declare function createFetchHandlerB<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: { router: TRouter } & FetchHandlerOptions<TRouter, TPlatform> & {
      /**
       * How long `dispose()` waits for the HTTP requests in flight.
       * @default '5 seconds'
       */
      drainTimeout?: Duration.Input;
    },
): FetchHandler<TPlatform>;

/** C: one top-level `drainTimeout` for requests and sockets; `websocket` has none. */
export declare function createFetchHandlerC<
  TRouter extends AnyRouter,
  TPlatform = undefined,
>(
  opts: { router: TRouter } & WithWebsocket<
    FetchHandlerOptions<TRouter, TPlatform>,
    Omit<Websocket, 'drainTimeout'>
  > & {
      /**
       * How long `dispose()` waits for requests and sockets.
       * @default '10 seconds'
       */
      drainTimeout?: Duration.Input;
    },
): FetchHandler<TPlatform>;
