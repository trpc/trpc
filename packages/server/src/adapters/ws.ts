import type { IncomingMessage } from 'http';
import type ws from 'ws';
import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
} from '../@trpc/server';
import {
  callProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  TRPCError,
} from '../@trpc/server';
import type { BaseHandlerOptions } from '../@trpc/server/http';
import { parseTRPCMessage } from '../@trpc/server/rpc';
// @trpc/server/rpc
import type {
  TRPCClientOutgoingMessage,
  TRPCReconnectNotification,
  TRPCResponseMessage,
} from '../@trpc/server/rpc';
import { isObservable } from '../observable';
import { observableToAsyncIterable } from '../observable/observable';
// eslint-disable-next-line no-restricted-imports
import {
  isAsyncIterable,
  run,
  type MaybePromise,
} from '../unstable-core-do-not-import';
import type { NodeHTTPCreateContextFnOptions } from './node-http';

/**
 * Importing ws causes a build error
 * @link https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

/**
 * @public
 */
export type CreateWSSContextFnOptions = Omit<
  NodeHTTPCreateContextFnOptions<IncomingMessage, ws.WebSocket>,
  'info'
>;

/**
 * @public
 */
export type CreateWSSContextFn<TRouter extends AnyRouter> = (
  opts: CreateWSSContextFnOptions,
) => MaybePromise<inferRouterContext<TRouter>>;

export type WSConnectionHandlerOptions<TRouter extends AnyRouter> =
  BaseHandlerOptions<TRouter, IncomingMessage> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      CreateWSSContextFn<TRouter>
    >;

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> =
  WSConnectionHandlerOptions<TRouter> & {
    wss: ws.WebSocketServer;
    prefix?: string;
    keepAlive?: {
      /**
       * Enable heartbeat messages
       * @default false
       */
      enabled: boolean;
      /**
       * Heartbeat interval in milliseconds
       * @default 30000
       */
      pingMs?: number;
      /**
       * Terminate the WebSocket if no pong is received after this many milliseconds
       * @default 5000
       */
      pongWaitMs?: number;
    };
  };

export function getWSConnectionHandler<TRouter extends AnyRouter>(
  opts: WSConnectionHandlerOptions<TRouter>,
) {
  const { createContext, router } = opts;
  const { transformer } = router._def._config;

  return async (client: ws.WebSocket, req: IncomingMessage) => {
    const clientSubscriptions = new Map<number | string, AbortController>();

    function respond(untransformedJSON: TRPCResponseMessage) {
      client.send(
        JSON.stringify(
          transformTRPCResponse(router._def._config, untransformedJSON),
        ),
      );
    }

    const ctxPromise = createContext?.({ req, res: client });
    let ctx: inferRouterContext<TRouter> | undefined = undefined;

    async function handleRequest(msg: TRPCClientOutgoingMessage) {
      const { id, jsonrpc } = msg;
      /* istanbul ignore next -- @preserve */
      if (id === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '`id` is required',
        });
      }
      if (msg.method === 'subscription.stop') {
        clientSubscriptions.get(id)?.abort();
        return;
      }
      const { path, input } = msg.params;
      const type = msg.method;
      try {
        await ctxPromise; // asserts context has been set

        const result = await callProcedure({
          procedures: router._def.procedures,
          path,
          getRawInput: async () => input,
          ctx,
          type,
        });

        if (type !== 'subscription') {
          // send the value as data if the method is not a subscription
          respond({
            id,
            jsonrpc,
            result: {
              type: 'data',
              data: result,
            },
          });
          return;
        }

        if (!isObservable(result) && !isAsyncIterable(result)) {
          throw new TRPCError({
            message: `Subscription ${path} did not return an observable or a AsyncGenerator`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }

        /* istanbul ignore next -- @preserve */
        if (client.readyState !== WEBSOCKET_OPEN) {
          // if the client got disconnected whilst initializing the subscription
          // no need to send stopped message if the client is disconnected

          return;
        }

        /* istanbul ignore next -- @preserve */
        if (clientSubscriptions.has(id)) {
          // duplicate request ids for client

          throw new TRPCError({
            message: `Duplicate id ${id}`,
            code: 'BAD_REQUEST',
          });
        }

        const iterable = isObservable(result)
          ? observableToAsyncIterable(result)
          : result;

        const iterator: AsyncIterator<unknown> =
          iterable[Symbol.asyncIterator]();
        const abortController = new AbortController();

        const abortPromise = new Promise<null>((resolve) => {
          abortController.signal.onabort = () => resolve(null);
        });

        run(async () => {
          while (true) {
            const next = await Promise.race([
              iterator.next().catch(getTRPCErrorFromUnknown),
              abortPromise,
            ]);

            if (next === null) {
              await iterator.return?.();
              break;
            }
            if (next instanceof Error) {
              const error = getTRPCErrorFromUnknown(next);
              opts.onError?.({ error, path, type, ctx, req, input });
              respond({
                id,
                jsonrpc,
                error: getErrorShape({
                  config: router._def._config,
                  error,
                  type,
                  path,
                  input,
                  ctx,
                }),
              });
              break;
            }
            if (next.done) {
              break;
            }

            respond({
              id,
              jsonrpc,
              result: {
                type: 'data',
                data: next.value,
              },
            });
          }

          await iterator.return?.();
          respond({
            id,
            jsonrpc,
            result: {
              type: 'stopped',
            },
          });
          clientSubscriptions.delete(id);
        }).catch((cause) => {
          const error = getTRPCErrorFromUnknown(cause);
          opts.onError?.({ error, path, type, ctx, req, input });
          respond({
            id,
            jsonrpc,
            error: getErrorShape({
              config: router._def._config,
              error,
              type,
              path,
              input,
              ctx,
            }),
          });
          abortController.abort();
        });
        clientSubscriptions.set(id, abortController);

        respond({
          id,
          jsonrpc,
          result: {
            type: 'started',
          },
        });
      } catch (cause) /* istanbul ignore next -- @preserve */ {
        // procedure threw an error
        const error = getTRPCErrorFromUnknown(cause);
        opts.onError?.({ error, path, type, ctx, req, input });
        respond({
          id,
          jsonrpc,
          error: getErrorShape({
            config: router._def._config,
            error,
            type,
            path,
            input,
            ctx,
          }),
        });
      }
    }
    client.on('message', async (message) => {
      try {
        const msgJSON: unknown = JSON.parse(message.toString());
        const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
        const promises = msgs
          .map((raw) => parseTRPCMessage(raw, transformer))
          .map(handleRequest);
        await Promise.all(promises);
      } catch (cause) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          cause,
        });

        respond({
          id: null,
          error: getErrorShape({
            config: router._def._config,
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx: undefined,
          }),
        });
      }
    });

    // WebSocket errors should be handled, as otherwise unhandled exceptions will crash Node.js.
    // This line was introduced after the following error brought down production systems:
    // "RangeError: Invalid WebSocket frame: RSV2 and RSV3 must be clear"
    // Here is the relevant discussion: https://github.com/websockets/ws/issues/1354#issuecomment-774616962
    client.on('error', (cause) => {
      opts.onError?.({
        ctx,
        error: getTRPCErrorFromUnknown(cause),
        input: undefined,
        path: undefined,
        type: 'unknown',
        req,
      });
    });

    client.once('close', () => {
      for (const sub of clientSubscriptions.values()) {
        sub.abort();
      }
      clientSubscriptions.clear();
    });
    async function createContextAsync() {
      try {
        ctx = await ctxPromise;
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        opts.onError?.({
          error,
          path: undefined,
          type: 'unknown',
          ctx,
          req,
          input: undefined,
        });
        respond({
          id: null,
          error: getErrorShape({
            config: router._def._config,
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx,
          }),
        });

        // close in next tick
        (global.setImmediate ?? global.setTimeout)(() => {
          client.close();
        });
      }
    }
    await createContextAsync();
  };
}

/**
 * Handle WebSocket keep-alive messages
 */
function handleKeepAlive(
  client: ws.WebSocket,
  pingMs = 30000,
  pongWaitMs = 5000,
) {
  let heartbeatTimeout: NodeJS.Timeout | undefined;
  const heartbeatInterval = setInterval(() => {
    if (client.readyState !== WEBSOCKET_OPEN) {
      return;
    }
    // First we send a ping message and wait for a pong
    client.ping();
    // We set a timeout to close the connection if the pong is not received
    heartbeatTimeout = setTimeout(() => {
      client.terminate();
      clearInterval(heartbeatInterval);
    }, pongWaitMs);
  }, pingMs).unref();
  // When we receive a pong message, we clear the timeout
  client.on('pong', () => {
    heartbeatTimeout && clearTimeout(heartbeatTimeout);
  });
  // If the connection is closed, we clear the interval
  client.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { wss, prefix, keepAlive } = opts;

  const onConnection = getWSConnectionHandler(opts);
  wss.on('connection', async (client, req) => {
    if (prefix && !req.url?.startsWith(prefix)) {
      return;
    }

    await onConnection(client, req);
    if (keepAlive?.enabled) {
      const { pingMs, pongWaitMs } = keepAlive;
      handleKeepAlive(client, pingMs, pongWaitMs);
    }
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);
      for (const client of wss.clients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(data);
        }
      }
    },
  };
}
