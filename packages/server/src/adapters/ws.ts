import type { IncomingMessage } from 'http';
import type { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
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
import { parseConnectionParamsFromUnknown } from '../http';
import { isObservable, observableToAsyncIterable } from '../observable';
// oxlint-disable-next-line no-restricted-imports
import {
  isAbortError,
  isAsyncIterable,
  isObject,
  isTrackedEnvelope,
  run,
  type MaybePromise,
} from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import type { Result } from '../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import { iteratorResource } from '../unstable-core-do-not-import/stream/utils/asyncIterable';
import { Unpromise } from '../vendor/unpromise';
import { createURL, type NodeHTTPCreateContextFnOptions } from './node-http';
import type { Encoder } from './wsEncoder';
import { jsonEncoder } from './wsEncoder';

/**
 * Importing ws causes a build error
 * @see https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

/**
 * What `createContext` gets in the WebSocket adapter: the upgrade request
 * as `req`, the socket as `res`, and `info`. It's called once per
 * connection.
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 * @public
 */
export type CreateWSSContextFnOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  WsWebSocket
>;

/**
 * The `createContext` function the WebSocket adapter takes.
 * @public
 */
export type CreateWSSContextFn<TRouter extends AnyRouter> = (
  opts: CreateWSSContextFnOptions,
) => MaybePromise<inferRouterContext<TRouter>>;

/** The options of `getWSConnectionHandler`. */
export type WSConnectionHandlerOptions<TRouter extends AnyRouter> =
  BaseHandlerOptions<TRouter, IncomingMessage> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      CreateWSSContextFn<TRouter>
    >;

/**
 * The options of `applyWSSHandler`.
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> =
  WSConnectionHandlerOptions<TRouter> & {
    /** The `ws` server to serve the router on. */
    wss: WebSocketServer;
    /** Only connections whose URL starts with this are served. */
    prefix?: string;
    /**
     * Sends pings to each client and closes connections that stop
     * answering.
     */
    keepAlive?: {
      /**
       * Whether to send pings.
       * @default false
       */
      enabled: boolean;
      /**
       * How long a connection can be quiet before a ping, in milliseconds.
       * @default 30_000
       */
      pingMs?: number;
      /**
       * How long to wait for a pong before closing the connection, in
       * milliseconds.
       * @default 5_000
       */
      pongWaitMs?: number;
    };
    /**
     * Stops answering clients' pings. Meant for tests.
     * @default false
     */
    dangerouslyDisablePong?: boolean;
    /**
     * Encodes and decodes messages, for formats other than JSON.
     * Experimental: it may change in any release.
     * @default jsonEncoder
     */
    experimental_encoder?: Encoder;
  };

/**
 * `iterator.next()` for a subscription loop that races it against the
 * subscription's `signal`, with a rejection turned into a `TRPCError`.
 *
 * Once the subscription is stopped, the loop doesn't wait for this call, so a
 * rejection after the stop, such as a teardown that throws, goes to
 * `onErrorAfterStop` and resolves `'abort'`. An `AbortError` is how a stopped
 * subscription is expected to end, and isn't reported.
 */
function nextUnlessStopped<TValue, TReturn>(
  iterator: AsyncIterator<TValue, TReturn>,
  signal: AbortSignal,
  onErrorAfterStop: (error: TRPCError) => void,
): Promise<IteratorResult<TValue, TReturn> | TRPCError | 'abort'> {
  return iterator.next().catch((cause: unknown) => {
    const error = getTRPCErrorFromUnknown(cause);
    if (!signal.aborted) {
      return error;
    }
    if (!isAbortError(error.cause)) {
      onErrorAfterStop(error);
    }
    return 'abort';
  });
}

/**
 * Returns a `ws` connection listener that serves a router. `applyWSSHandler`
 * uses it; call it to attach tRPC to your own WebSocket server.
 */
export function getWSConnectionHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { createContext, router } = opts;
  const { transformer } = router._def._config;
  const encoder = opts.experimental_encoder ?? jsonEncoder;

  return (client: WsWebSocket, req: IncomingMessage) => {
    type Context = inferRouterContext<TRouter>;
    type ContextResult = Result<Context>;

    const clientSubscriptions = new Map<number | string, AbortController>();
    const abortController = new AbortController();

    if (opts.keepAlive?.enabled) {
      const { pingMs, pongWaitMs } = opts.keepAlive;
      handleKeepAlive(client, pingMs, pongWaitMs);
    }

    function respond(untransformedJSON: TRPCResponseMessage) {
      client.send(
        encoder.encode(
          transformTRPCResponse(router._def._config, untransformedJSON),
        ),
      );
    }

    async function createCtxPromise(
      getConnectionParams: () => TRPCRequestInfo['connectionParams'],
    ): Promise<ContextResult> {
      try {
        return await run(async (): Promise<ContextResult> => {
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
              url: null,
            },
          });

          return {
            ok: true,
            value: ctx,
          };
        });
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
        (globalThis.setImmediate ?? globalThis.setTimeout)(() => {
          client.close();
        });
        return {
          ok: false,
          error,
        };
      }
    }

    let ctx: Context | undefined = undefined;

    /**
     * promise for initializing the context
     *
     * - the context promise will be created immediately on connection if no connectionParams are expected
     * - if connection params are expected, they will be created once received
     */
    let ctxPromise =
      createURL(req).searchParams.get('connectionParams') === '1'
        ? null
        : createCtxPromise(() => null);

    function handleRequest(msg: TRPCClientOutgoingMessage, batchIndex: number) {
      const { id, jsonrpc } = msg;

      if (id === null) {
        const error = getTRPCErrorFromUnknown(
          new TRPCError({
            code: 'PARSE_ERROR',
            message: '`id` is required',
          }),
        );
        opts.onError?.({
          error,
          path: undefined,
          type: 'unknown',
          ctx,
          req,
          input: undefined,
        });
        respond({
          id,
          jsonrpc,
          error: getErrorShape({
            config: router._def._config,
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx,
          }),
        });
        return;
      }
      if (msg.method === 'subscription.stop') {
        clientSubscriptions.get(id)?.abort();
        return;
      }
      const { path, lastEventId } = msg.params;
      let { input } = msg.params;
      const type = msg.method;

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
      run(async () => {
        // oxlint-disable-next-line typescript/no-non-null-assertion
        const res = await ctxPromise!; // asserts context has been set
        if (!res.ok) {
          throw res.error;
        }

        const abortController = new AbortController();
        const result = await callTRPCProcedure({
          router,
          path,
          getRawInput: async () => input,
          ctx,
          type,
          signal: abortController.signal,
          batchIndex,
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
              nextUnlessStopped(iterator, abortController.signal, (error) =>
                opts.onError?.({ error, path, type, ctx, req, input }),
              ),
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
          clientSubscriptions.delete(id);
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
      }).catch((cause) => {
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
      });
    }
    client.on('message', (rawData, isBinary) => {
      // Handle PING/PONG as text regardless of encoder
      if (!isBinary) {
        // oxlint-disable-next-line typescript/no-base-to-string
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
      }

      // Convert rawData to a format our encoder accepts
      // ws gives us Buffer for both text and binary frames
      if (!Buffer.isBuffer(rawData)) {
        const error = new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: 'Unexpected WebSocket message format',
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
        return;
      }
      const data: string | Uint8Array = isBinary
        ? rawData
        : rawData.toString('utf8');

      if (!ctxPromise) {
        // If the ctxPromise wasn't created immediately, we're expecting the first message to be a TRPCConnectionParamsMessage
        ctxPromise = createCtxPromise(() => {
          let msg;
          try {
            msg = encoder.decode(data) as TRPCConnectionParamsMessage;

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

      const parsedMsgs = run(() => {
        try {
          const msgJSON: unknown = encoder.decode(data);
          const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];

          if (
            Array.isArray(msgJSON) &&
            typeof opts.maxBatchSize === 'number' &&
            msgs.length > opts.maxBatchSize
          ) {
            const error = new TRPCError({
              code: 'BAD_REQUEST',
              message: `Batch call exceeds maximum size`,
            });
            opts.onError?.({
              error,
              path: undefined,
              type: 'unknown',
              ctx,
              req,
              input: undefined,
            });
            const errorShape = getErrorShape({
              config: router._def._config,
              error,
              type: 'unknown',
              path: undefined,
              input: undefined,
              ctx,
            });

            // Checked before parsing so that no input is deserialized.
            // Every request in the batch gets the error, as a batched HTTP
            // call does, so that clients do not wait for a response forever.
            let responded = false;
            for (const raw of msgs) {
              if (
                isObject(raw) &&
                raw['method'] !== 'subscription.stop' &&
                (typeof raw['id'] === 'number' || typeof raw['id'] === 'string')
              ) {
                respond({
                  id: raw['id'],
                  jsonrpc: raw['jsonrpc'] === '2.0' ? '2.0' : undefined,
                  error: errorShape,
                });
                responded = true;
              }
            }
            if (!responded) {
              respond({ id: null, error: errorShape });
            }
            return [];
          }

          return msgs.map((raw) => parseTRPCMessage(raw, transformer));
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
              ctx,
            }),
          });

          return [];
        }
      });

      parsedMsgs.map((msg, index) => handleRequest(msg, index));
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
  };
}

/**
 * Pings a client after `pingMs` of quiet, and closes the connection if no
 * message comes within `pongWaitMs`.
 */
export function handleKeepAlive(
  client: WsWebSocket,
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

/**
 * Serves a router on a `ws` WebSocket server. Returns
 * `broadcastReconnectNotification()`, which tells every client to
 * reconnect, for example before a deploy.
 * @example
 * ```ts
 * const wss = new WebSocketServer({ port: 3001 });
 * const handler = applyWSSHandler({ wss, router: appRouter, createContext });
 * process.on('SIGTERM', () => {
 *   handler.broadcastReconnectNotification();
 *   wss.close();
 * });
 * ```
 * @see https://trpc.io/docs/server/websockets#creating-a-websocket-server
 */
export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const encoder = opts.experimental_encoder ?? jsonEncoder;
  const onConnection = getWSConnectionHandler(opts);
  opts.wss.on('connection', (client, req) => {
    if (opts.prefix && !req.url?.startsWith(opts.prefix)) {
      return;
    }

    onConnection(client, req);
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = encoder.encode(response);
      for (const client of opts.wss.clients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(data);
        }
      }
    },
  };
}

export type { Encoder } from './wsEncoder';
export { jsonEncoder } from './wsEncoder';
