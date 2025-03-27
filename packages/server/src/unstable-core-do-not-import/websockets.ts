import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
} from '../@trpc/server';
import {
  callTRPCProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  TRPCError,
} from '../@trpc/server';
import type { TRPCRequestInfo } from '../@trpc/server/http';
import { type BaseHandlerOptions } from '../@trpc/server/http';
import { parseTRPCMessage } from '../@trpc/server/rpc';
// @trpc/server/rpc
import type {
  TRPCClientOutgoingMessage,
  TRPCConnectionParamsMessage,
  TRPCReconnectNotification,
  TRPCResponseMessage,
  TRPCResultMessage,
} from '../@trpc/server/rpc';
import { type NodeHTTPCreateContextFnOptions } from '../adapters/node-http';
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
// eslint-disable-next-line no-restricted-imports
import { iteratorResource } from '../unstable-core-do-not-import/stream/utils/asyncIterable';
import { Unpromise } from '../vendor/unpromise';

/**
 * @public
 */
export type CreateWSSContextFnOptions = NodeHTTPCreateContextFnOptions<
  Request,
  WsClient
>;

/**
 * @public
 */
export type CreateWSSContextFn<TRouter extends AnyRouter> = (
  opts: CreateWSSContextFnOptions,
) => MaybePromise<inferRouterContext<TRouter>>;

export type WSConnectionHandlerOptions<TRouter extends AnyRouter> =
  BaseHandlerOptions<TRouter, Request> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      CreateWSSContextFn<TRouter>
    >;

/**
 * Web socket server handler
 */
export type WSHandlerOptions<TRouter extends AnyRouter> =
  WSConnectionHandlerOptions<TRouter> & {
    // server should NOT leak its implementation here
    // this domain only handles tRPC websocket protocol
    // wss: ws.WebSocketServer;
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

// this mostly conforms to `ws.WebSocket`
// any other server implementation can mascarade as this interface
export interface WsClient {
  send(message: string): void;
  close(code?: number): void;
  terminate(): void;
}

interface WsConnection {
  onMessage(rawData: string): Promise<void>;
  onClose(code: number): void;
  onError(cause: Error): void;
}

interface WsHandler {
  newConnection(req: Request, wsClient: WsClient): WsConnection;
  broadcastReconnectNotification(): void;
}

interface DeferredPromise {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

function createDeferredPromise(): DeferredPromise {
  let resolve: () => void;
  let reject: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    resolve: resolve!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    reject: reject!,
  };
}

// const unsetContextPromiseSymbol = Symbol('unsetContextPromise');

export function newWsHandler<TRouter extends AnyRouter>(
  opts: WSHandlerOptions<TRouter>,
): WsHandler {
  const { createContext, router } = opts;
  const { transformer } = router._def._config;

  const clients = new Set<WsClient>();

  return {
    newConnection(req, client): WsConnection {
      clients.add(client);

      const clientSubscriptions = new Map<number | string, AbortController>();
      const abortController = new AbortController();

      let keepAlive: KeepAliver | null = null;

      if (opts.keepAlive?.enabled) {
        const { pingMs, pongWaitMs } = opts.keepAlive;
        keepAlive = makeKeepAlive(client, pingMs, pongWaitMs);
      }

      function respond(untransformedJSON: TRPCResponseMessage) {
        client.send(
          JSON.stringify(
            transformTRPCResponse(router._def._config, untransformedJSON),
          ),
        );
      }

      let ctx: inferRouterContext<TRouter> | undefined = undefined;

      /**
       * inside-out promise that resolves when context is ready.
       *
       * - when this is null, the context resolution will be started
       * - otherwise all requests must await context resolution
       */
      let ctxReady: DeferredPromise | null = null;

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

          const abortController = new AbortController();
          const result = await callTRPCProcedure({
            router,
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

          // TODO: add ability to query client status
          /* istanbul ignore next -- @preserve */
          // if (client.readyState !== WEBSOCKET_OPEN) {
          //   // if the client got disconnected whilst initializing the subscription
          //   // no need to send stopped message if the client is disconnected

          //   return;
          // }

          /* istanbul ignore next -- @preserve */
          if (clientSubscriptions.has(id)) {
            // duplicate request ids for client

            throw new TRPCError({
              message: `Duplicate id ${id}`,
              code: 'BAD_REQUEST',
            });
          }

          const iterable = isObservable(result)
            ? observableToAsyncIterable(result, abortController.signal)
            : result;

          run(async () => {
            await using iterator = iteratorResource(iterable);

            const abortPromise = new Promise<'abort'>((resolve) => {
              abortController.signal.onabort = () => resolve('abort');
            });
            // We need those declarations outside the loop for garbage collection reasons. If they
            // were declared inside, they would not be freed until the next value is present.
            let next:
              | null
              | TRPCError
              | Awaited<
                  typeof abortPromise | ReturnType<(typeof iterator)['next']>
                >;
            let result: null | TRPCResultMessage<unknown>['result'];

            while (true) {
              next = await Unpromise.race([
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

              result = {
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

              // free up references for garbage collection
              next = null;
              result = null;
            }

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

      function getConnectionParams(
        msgStr: string,
      ): TRPCRequestInfo['connectionParams'] {
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
      }

      return {
        async onMessage(msgStr) {
          if (keepAlive) {
            keepAlive.onMessage();
          }
          if (msgStr === 'PONG') {
            return;
          }
          if (msgStr === 'PING') {
            if (!opts.dangerouslyDisablePong) {
              // TODO: also do all the timeouts in here if keepalive is enabled
              client.send('PONG');
            }
            return;
          }

          if (ctxReady == null) {
            ctxReady = createDeferredPromise();

            const useConnectionParams =
              new URL(req.url).searchParams.get('connectionParams') === '1';

            try {
              ctx = await createContext?.({
                req,
                res: client,
                info: {
                  connectionParams: useConnectionParams
                    ? getConnectionParams(msgStr)
                    : null,
                  calls: [],
                  isBatchCall: false,
                  accept: null,
                  type: 'unknown',
                  signal: abortController.signal,
                  url: null,
                },
              });
              ctxReady.resolve();
            } catch (cause) {
              const error = getTRPCErrorFromUnknown(cause);
              opts.onError?.({
                ctx,
                error: error,
                input: undefined,
                path: undefined,
                type: 'unknown',
                req,
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

              ctxReady.reject(error);
            }

            if (useConnectionParams) {
              // fully consume first message
              return;
            }
          }

          try {
            await ctxReady.promise;
          } catch {
            // stop execution of pending requests when context could not be resolved
            // single error message will be sent
            return;
          }

          try {
            const msgJSON: unknown = JSON.parse(msgStr);
            const msgs: unknown[] = Array.isArray(msgJSON)
              ? msgJSON
              : [msgJSON];
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
        },
        onClose(code) {
          if (keepAlive) {
            keepAlive.onClose();
          }
          // TODO: interpret the close code. Decide on what means what
          // in accordance with https://datatracker.ietf.org/doc/html/rfc6455#section-7.4
          // or interpret 1000 as normal, and treat other codes as abnormal
          const _ = code;
          for (const sub of clientSubscriptions.values()) {
            sub.abort();
          }
          clientSubscriptions.clear();
          abortController.abort();
        },
        onError(cause) {
          opts.onError?.({
            ctx,
            error: getTRPCErrorFromUnknown(cause),
            input: undefined,
            path: undefined,
            type: 'unknown',
            req,
          });
        },
      };
    },
    broadcastReconnectNotification() {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);
      for (const client of clients) {
        client.send(data);
      }
    },
  };
}

interface KeepAliver {
  onMessage(): void;
  onClose(): void;
}

/**
 * Handle WebSocket keep-alive messages
 */
export function makeKeepAlive(
  client: WsClient,
  pingMs = 30_000,
  pongWaitMs = 5_000,
): KeepAliver {
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

  function onMessage() {
    clearTimeout(ping);
    clearTimeout(timeout);

    schedulePing();
  }
  function onClose() {
    clearTimeout(ping);
    clearTimeout(timeout);
  }

  schedulePing();

  return {
    onMessage,
    onClose,
  };
}
