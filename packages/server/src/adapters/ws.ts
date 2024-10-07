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
import type { TRPCRequestInfo } from '../@trpc/server/http';
import { toURL, type BaseHandlerOptions } from '../@trpc/server/http';
import { parseTRPCMessage } from '../@trpc/server/rpc';
// @trpc/server/rpc
import type {
  TRPCClientOutgoingMessage,
  TRPCConnectionParamsMessage,
  TRPCReconnectNotification,
  TRPCResponseMessage,
  TRPCResultMessage,
} from '../@trpc/server/rpc';
import { parseConnectionParamsFromUnknown } from '../http';
import { isObservable, observableToAsyncIterable } from '../observable';
// eslint-disable-next-line no-restricted-imports
import {
  isAsyncIterable,
  isObject,
  isTrackedEnvelope,
  run,
  type MaybePromise,
} from '../unstable-core-do-not-import';
import type { NodeHTTPCreateContextFnOptions } from './node-http';

/**
 * Importing ws causes a build error
 * @see https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

/**
 * @public
 */
export type CreateWSSContextFnOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  ws.WebSocket
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
       * @default 30_000
       */
      pingMs?: number;
      /**
       * Terminate the WebSocket if no pong is received after this many milliseconds
       * @default 5_000
       */
      pongWaitMs?: number;
    };
    /**
     * Disable responding to ping messages from the client
     * **Not recommended** - this is mainly used for testing
     * @default false
     */
    dangerouslyDisablePong?: boolean;
  };

const unsetContextPromiseSymbol = Symbol('unsetContextPromise');
export function getWSConnectionHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { createContext, router } = opts;
  const { transformer } = router._def._config;

  return async (client: ws.WebSocket, req: IncomingMessage) => {
    const clientSubscriptions = new Map<number | string, AbortController>();
    const abortController = new AbortController();

    if (opts.keepAlive?.enabled) {
      const { pingMs, pongWaitMs } = opts.keepAlive;
      handleKeepAlive(client, pingMs, pongWaitMs);
    }

    function respond(untransformedJSON: TRPCResponseMessage) {
      client.send(
        JSON.stringify(
          transformTRPCResponse(router._def._config, untransformedJSON),
        ),
      );
    }

    function createCtxPromise(
      getConnectionParams: () => TRPCRequestInfo['connectionParams'],
    ): Promise<inferRouterContext<TRouter>> {
      return run(async () => {
        ctx = await createContext?.({
          req,
          res: client,
          info: {
            connectionParams: getConnectionParams(),
            calls: [],
            isBatchCall: false,
            accept: null,
            type: 'unknown',
            signal: abortController.signal,
          },
        });

        return ctx;
      }).catch((cause) => {
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
        (globalThis.setImmediate ?? globalThis.setTimeout)(() => {
          client.close();
        });

        throw error;
      });
    }

    let ctx: inferRouterContext<TRouter> | undefined = undefined;

    /**
     * promise for initializing the context
     *
     * - the context promise will be created immediately on connection if no connectionParams are expected
     * - if connection params are expected, they will be created once received
     */
    let ctxPromise =
      toURL(req.url ?? '').searchParams.get('connectionParams') === '1'
        ? unsetContextPromiseSymbol
        : createCtxPromise(() => null);

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
      const { path, lastEventId } = msg.params;
      let { input } = msg.params;
      const type = msg.method;
      try {
        if (lastEventId !== undefined) {
          if (isObject(input)) {
            input = {
              ...input,
              lastEventId: lastEventId,
            };
          } else {
            input ??= {
              lastEventId: lastEventId,
            };
          }
        }
        await ctxPromise; // asserts context has been set

        const abortController = new AbortController();
        const result = await callProcedure({
          procedures: router._def.procedures,
          path,
          getRawInput: async () => input,
          ctx,
          type,
          signal: abortController.signal,
        });

        const isIterableResult =
          isAsyncIterable(result) || isObservable(result);

        if (type !== 'subscription') {
          if (isIterableResult) {
            throw new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message: `Cannot return an async iterable or observable from a ${type} procedure with WebSockets`,
            });
          }
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

        if (!isIterableResult) {
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

        const abortPromise = new Promise<'abort'>((resolve) => {
          abortController.signal.onabort = () => resolve('abort');
        });

        run(async () => {
          while (true) {
            const next = await Promise.race([
              iterator.next().catch(getTRPCErrorFromUnknown),
              abortPromise,
            ]);

            if (next === 'abort') {
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

            const result: TRPCResultMessage<unknown>['result'] = {
              type: 'data',
              data: next.value,
            };

            if (isTrackedEnvelope(next.value)) {
              const [id, data] = next.value;
              result.id = id;
              result.data = {
                id,
                data,
              };
            }

            respond({
              id,
              jsonrpc,
              result,
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
    client.on('message', async (rawData) => {
      const msgStr = rawData.toString();
      if (msgStr === 'PONG') {
        return;
      }
      if (msgStr === 'PING') {
        if (!opts.dangerouslyDisablePong) {
          client.send('PONG');
        }
        return;
      }
      if (ctxPromise === unsetContextPromiseSymbol) {
        // If the ctxPromise wasn't created immediately, we're expecting the first message to be a TRPCConnectionParamsMessage
        ctxPromise = createCtxPromise(() => {
          let msg;
          try {
            msg = JSON.parse(msgStr) as TRPCConnectionParamsMessage;

            if (!isObject(msg)) {
              throw new Error('Message was not an object');
            }
          } catch (cause) {
            throw new TRPCError({
              code: 'PARSE_ERROR',
              message: `Malformed TRPCConnectionParamsMessage`,
              cause,
            });
          }

          const connectionParams = parseConnectionParamsFromUnknown(msg.data);

          return connectionParams;
        });
        return;
      }
      try {
        const msgJSON: unknown = JSON.parse(msgStr);
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
      abortController.abort();
    });

    if (ctxPromise !== unsetContextPromiseSymbol) {
      await ctxPromise;
    }
  };
}

/**
 * Handle WebSocket keep-alive messages
 */
export function handleKeepAlive(
  client: ws.WebSocket,
  pingMs = 30_000,
  pongWaitMs = 5_000,
) {
  let timeout: NodeJS.Timeout | undefined = undefined;
  let ping: NodeJS.Timeout | undefined = undefined;

  const schedulePing = () => {
    const scheduleTimeout = () => {
      timeout = setTimeout(() => {
        client.terminate();
      }, pongWaitMs);
    };
    ping = setTimeout(() => {
      client.send('PING');

      scheduleTimeout();
    }, pingMs);
  };

  const onMessage = () => {
    clearTimeout(ping);
    clearTimeout(timeout);

    schedulePing();
  };

  client.on('message', onMessage);

  client.on('close', () => {
    clearTimeout(ping);
    clearTimeout(timeout);
  });

  schedulePing();
}

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const onConnection = getWSConnectionHandler(opts);
  opts.wss.on('connection', (client, req) => {
    if (opts.prefix && !req.url?.startsWith(opts.prefix)) {
      return;
    }

    onConnection(client, req).catch((cause) => {
      opts.onError?.({
        error: new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          cause,
          message: 'Failed to handle WebSocket connection',
        }),
        req: req,
        path: undefined,
        type: 'unknown',
        ctx: undefined,
        input: undefined,
      });

      client.close();
    });
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);
      for (const client of opts.wss.clients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(data);
        }
      }
    },
  };
}
