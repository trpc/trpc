import type { Observer, UnsubscribeFn } from '@trpc/server/observable';
import { behaviorSubject, observable } from '@trpc/server/observable';
import type { TRPCConnectionParamsMessage } from '@trpc/server/rpc';
import type {
  AnyRouter,
  inferClientTypes,
  inferRouterError,
  ProcedureType,
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
  TRPCResponseMessage,
} from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../TRPCClientError';
import type { TransformerOptions } from '../unstable-internals';
import { getTransformer } from '../unstable-internals';
import type { TRPCConnectionState } from './internals/subscriptions';
import {
  resultOf,
  type UrlOptionsWithConnectionParams,
} from './internals/urlWithConnectionParams';
import type { Operation, TRPCLink } from './types';

const run = <TResult>(fn: () => TResult): TResult => fn();

type WSCallbackResult<TRouter extends AnyRouter, TOutput> = TRPCResponseMessage<
  TOutput,
  inferRouterError<TRouter>
>;

type WSCallbackObserver<TRouter extends AnyRouter, TOutput> = Observer<
  WSCallbackResult<TRouter, TOutput>,
  TRPCClientError<TRouter>
>;

const exponentialBackoff = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

export interface WebSocketClientOptions extends UrlOptionsWithConnectionParams {
  /**
   * Ponyfill which WebSocket implementation to use
   */
  WebSocket?: typeof WebSocket;
  /**
   * The number of milliseconds before a reconnect is attempted.
   * @default {@link exponentialBackoff}
   */
  retryDelayMs?: typeof exponentialBackoff;
  /**
   * Triggered when a WebSocket connection is established
   */
  onOpen?: () => void;
  /**
   * Triggered when a WebSocket connection encounters an error
   */
  onError?: (evt?: Event) => void;
  /**
   * Triggered when a WebSocket connection is closed
   */
  onClose?: (cause?: { code?: number }) => void;
  /**
   * Lazy mode will close the WebSocket automatically after a period of inactivity (no messages sent or received and no pending requests)
   */
  lazy?: {
    /**
     * Enable lazy mode
     * @default false
     */
    enabled: boolean;
    /**
     * Close the WebSocket after this many milliseconds
     * @default 0
     */
    closeMs: number;
  };
  /**
   * Send ping messages to the server and kill the connection if no pong message is returned
   */
  keepAlive?: {
    /**
     * @default false
     */
    enabled: boolean;
    /**
     * Send a ping message every this many milliseconds
     * @default 5_000
     */
    intervalMs?: number;
    /**
     * Close the WebSocket after this many milliseconds if the server does not respond
     * @default 1_000
     */
    pongTimeoutMs?: number;
  };
}

type LazyOptions = Required<NonNullable<WebSocketClientOptions['lazy']>>;
const lazyDefaults: LazyOptions = {
  enabled: false,
  closeMs: 0,
};

/**
 * @see https://trpc.io/docs/v11/client/links/wsLink
 * @deprecated
 * 🙋‍♂️ **Contributors needed** to continue supporting WebSockets!
 * See https://github.com/trpc/trpc/issues/6109
 */
export function createWSClient(opts: WebSocketClientOptions) {
  const {
    WebSocket: WebSocketImpl = WebSocket,
    retryDelayMs: retryDelayFn = exponentialBackoff,
  } = opts;
  const lazyOpts: LazyOptions = {
    ...lazyDefaults,
    ...opts.lazy,
  };

  /* istanbul ignore next -- @preserve */
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  /**
   * outgoing messages buffer whilst not open
   */
  let outgoing: TRPCClientOutgoingMessage[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  type TCallbacks = WSCallbackObserver<AnyRouter, unknown>;
  type WsRequest = {
    /**
     * Reference to the WebSocket instance this request was made to
     */
    connection: Connection | null;
    type: ProcedureType;
    callbacks: TCallbacks;
    op: Operation;
    /**
     * The last event id that the client has received
     */
    lastEventId: string | undefined;
  };
  const pendingRequests: Record<number | string, WsRequest> =
    Object.create(null);
  let connectAttempt = 0;
  let connectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let connectionIndex = 0;
  let lazyDisconnectTimer: ReturnType<typeof setTimeout> | undefined =
    undefined;
  let activeConnection: null | Connection = lazyOpts.enabled
    ? null
    : createConnection();

  type Connection = {
    id: number;
  } & (
    | {
        state: 'open';
        ws: WebSocket;
      }
    | {
        state: 'closed';
        ws: WebSocket;
      }
    | {
        state: 'connecting';
        ws?: WebSocket;
      }
  );

  const initState: TRPCConnectionState<TRPCClientError<AnyRouter>> =
    activeConnection
      ? {
          type: 'state',
          state: 'connecting',
          error: null,
        }
      : {
          type: 'state',
          state: 'idle',
          error: null,
        };
  const connectionState =
    behaviorSubject<TRPCConnectionState<TRPCClientError<AnyRouter>>>(initState);

  /**
   * tries to send the list of messages
   */
  function dispatch() {
    if (!activeConnection) {
      reconnect(null);
      return;
    }
    // using a timeout to batch messages
    setTimeout(() => {
      if (activeConnection?.state !== 'open') {
        return;
      }
      for (const pending of Object.values(pendingRequests)) {
        if (!pending.connection) {
          pending.connection = activeConnection;
        }
      }
      if (outgoing.length === 1) {
        // single send
        activeConnection.ws.send(JSON.stringify(outgoing.pop()));
      } else {
        // batch send
        activeConnection.ws.send(JSON.stringify(outgoing));
      }
      // clear
      outgoing = [];

      startLazyDisconnectTimer();
    });
  }
  function tryReconnect(cause: Error | null) {
    if (!!connectTimer) {
      return;
    }

    const timeout = retryDelayFn(connectAttempt++);
    reconnectInMs(timeout, cause);
  }
  function hasPendingRequests(conn?: Connection) {
    const requests = Object.values(pendingRequests);
    if (!conn) {
      return requests.length > 0;
    }
    return requests.some((req) => req.connection === conn);
  }

  function reconnect(cause: Error | null) {
    if (lazyOpts.enabled && !hasPendingRequests()) {
      // Skip reconnecting if there aren't pending requests and we're in lazy mode
      return;
    }
    const oldConnection = activeConnection;
    activeConnection = createConnection();
    if (oldConnection) {
      closeIfNoPending(oldConnection);
    }

    const currentState = connectionState.get();
    if (currentState.state !== 'connecting') {
      connectionState.next({
        type: 'state',
        state: 'connecting',
        error: cause ? TRPCClientError.from(cause) : null,
      });
    }
  }
  function reconnectInMs(ms: number, cause: Error | null) {
    if (connectTimer) {
      return;
    }
    connectTimer = setTimeout(() => {
      reconnect(cause);
    }, ms);
  }

  function closeIfNoPending(conn: Connection) {
    // disconnect as soon as there are are no pending requests
    if (!hasPendingRequests(conn)) {
      conn.ws?.close();
    }
  }
  function resumeSubscriptionOnReconnect(req: WsRequest) {
    if (outgoing.some((r) => r.id === req.op.id)) {
      return;
    }
    request({
      op: req.op,
      callbacks: req.callbacks,
      lastEventId: req.lastEventId,
    });
  }

  const startLazyDisconnectTimer = () => {
    if (!lazyOpts.enabled) {
      return;
    }

    clearTimeout(lazyDisconnectTimer);
    lazyDisconnectTimer = setTimeout(() => {
      if (!activeConnection) {
        return;
      }

      if (!hasPendingRequests()) {
        activeConnection.ws?.close();
        activeConnection = null;
        connectionState.next({
          type: 'state',
          state: 'idle',
          error: null,
        });
      }
    }, lazyOpts.closeMs);
  };

  function createConnection(): Connection {
    let pingTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
    let pongTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
    const self: Connection = {
      id: ++connectionIndex,
      state: 'connecting',
    } as Connection;

    clearTimeout(lazyDisconnectTimer);

    function destroy() {
      const noop = () => {
        // no-op
      };
      const { ws } = self;
      if (ws) {
        ws.onclose = noop;
        ws.onerror = noop;
        ws.onmessage = noop;
        ws.onopen = noop;

        ws.close();
      }

      self.state = 'closed';
    }

    const onCloseOrError = (cause: Error | null) => {
      clearTimeout(pingTimeout);
      clearTimeout(pongTimeout);

      self.state = 'closed';
      if (activeConnection === self) {
        // connection might have been replaced already
        tryReconnect(cause);
      }

      for (const [key, req] of Object.entries(pendingRequests)) {
        if (req.connection !== self) {
          continue;
        }

        // The connection was closed either unexpectedly or because of a reconnect
        if (req.type === 'subscription') {
          // Subscriptions will resume after we've reconnected
          resumeSubscriptionOnReconnect(req);
        } else {
          // Queries and mutations will error if interrupted
          delete pendingRequests[key];
          req.callbacks.error?.(
            TRPCClientError.from(cause ?? new TRPCWebSocketClosedError()),
          );
        }
      }
    };

    const onError = (evt?: Event) => {
      onCloseOrError(new TRPCWebSocketClosedError({ cause: evt }));
      opts.onError?.(evt);
    };

    function connect(url: string) {
      if (opts.connectionParams) {
        // append `?connectionParams=1` when connection params are used
        const prefix = url.includes('?') ? '&' : '?';
        url += prefix + 'connectionParams=1';
      }

      const ws = new WebSocketImpl(url);
      self.ws = ws;

      clearTimeout(connectTimer);
      connectTimer = undefined;

      ws.onopen = () => {
        async function sendConnectionParams() {
          if (!opts.connectionParams) {
            return;
          }

          const connectMsg: TRPCConnectionParamsMessage = {
            method: 'connectionParams',
            data: await resultOf(opts.connectionParams),
          };

          ws.send(JSON.stringify(connectMsg));
        }
        function handleKeepAlive() {
          if (!opts.keepAlive?.enabled) {
            return;
          }
          const { pongTimeoutMs = 1_000, intervalMs = 5_000 } = opts.keepAlive;

          const schedulePing = () => {
            const schedulePongTimeout = () => {
              pongTimeout = setTimeout(() => {
                const wasOpen = self.state === 'open';
                destroy();
                if (wasOpen) {
                  opts.onClose?.();
                }
              }, pongTimeoutMs);
            };
            pingTimeout = setTimeout(() => {
              ws.send('PING');
              schedulePongTimeout();
            }, intervalMs);
          };
          ws.addEventListener('message', () => {
            clearTimeout(pingTimeout);
            clearTimeout(pongTimeout);

            schedulePing();
          });
          schedulePing();
        }
        run(async () => {
          /* istanbul ignore next -- @preserve */
          if (activeConnection?.ws !== ws) {
            return;
          }
          handleKeepAlive();

          await sendConnectionParams();

          connectAttempt = 0;
          self.state = 'open';

          // Update connection state
          connectionState.next({
            type: 'state',
            state: 'pending',
            error: null,
          });

          opts.onOpen?.();
          dispatch();
        }).catch((cause: unknown) => {
          ws.close(
            // "Status codes in the range 3000-3999 are reserved for use by libraries, frameworks, and applications"
            3000,
          );
          onCloseOrError(
            new TRPCWebSocketClosedError({
              message: 'Initialization error',
              cause,
            }),
          );
        });
      };
      ws.onerror = onError;
      const handleIncomingRequest = (req: TRPCClientIncomingRequest) => {
        if (self !== activeConnection) {
          return;
        }

        if (req.method === 'reconnect') {
          reconnect(
            new TRPCWebSocketClosedError({
              message: 'Server requested reconnect',
            }),
          );
          // notify subscribers
          for (const pendingReq of Object.values(pendingRequests)) {
            if (pendingReq.type === 'subscription') {
              resumeSubscriptionOnReconnect(pendingReq);
            }
          }
        }
      };
      const handleIncomingResponse = (data: TRPCResponseMessage) => {
        const req = data.id !== null && pendingRequests[data.id];
        if (!req) {
          // do something?
          return;
        }

        req.callbacks.next?.(data);
        if (self === activeConnection && req.connection !== activeConnection) {
          // gracefully replace old connection with a new connection
          req.connection = self;
        }
        if (req.connection !== self) {
          // the connection has been replaced
          return;
        }

        if (
          'result' in data &&
          data.result.type === 'data' &&
          typeof data.result.id === 'string'
        ) {
          req.lastEventId = data.result.id;
        }
        if (
          'result' in data &&
          data.result.type === 'stopped' &&
          activeConnection === self
        ) {
          req.callbacks.complete();
        }
      };

      ws.onmessage = (event) => {
        const { data } = event;
        if (data === 'PONG') {
          return;
        }
        if (data === 'PING') {
          ws.send('PONG');
          return;
        }
        startLazyDisconnectTimer();

        const msg = JSON.parse(data) as TRPCClientIncomingMessage;

        if ('method' in msg) {
          handleIncomingRequest(msg);
        } else {
          handleIncomingResponse(msg);
        }
        if (self !== activeConnection) {
          // when receiving a message, we close old connection that has no pending requests
          closeIfNoPending(self);
        }
      };

      ws.onclose = (event) => {
        const wasOpen = self.state === 'open';

        destroy();
        onCloseOrError(new TRPCWebSocketClosedError({ cause: event }));

        if (wasOpen) {
          opts.onClose?.(event);
        }
      };
    }

    Promise.resolve(resultOf(opts.url))
      .then(connect)
      .catch(() => {
        onCloseOrError(new Error('Failed to resolve url'));
      });
    return self;
  }

  function request(opts: {
    op: Operation;
    callbacks: TCallbacks;
    lastEventId: string | undefined;
  }): UnsubscribeFn {
    const { op, callbacks, lastEventId } = opts;
    const { type, input, path, id } = op;
    const envelope: TRPCRequestMessage = {
      id,
      method: type,
      params: {
        input,
        path,
        lastEventId,
      },
    };

    pendingRequests[id] = {
      connection: null,
      type,
      callbacks,
      op,
      lastEventId,
    };

    // enqueue message
    outgoing.push(envelope);

    dispatch();

    return () => {
      const callbacks = pendingRequests[id]?.callbacks;
      delete pendingRequests[id];
      outgoing = outgoing.filter((msg) => msg.id !== id);

      callbacks?.complete?.();
      if (activeConnection?.state === 'open' && op.type === 'subscription') {
        outgoing.push({
          id,
          method: 'subscription.stop',
        });
        dispatch();
      }
      startLazyDisconnectTimer();
    };
  }

  return {
    close: () => {
      connectAttempt = 0;

      for (const req of Object.values(pendingRequests)) {
        if (req.type === 'subscription') {
          req.callbacks.complete();
        } else if (!req.connection) {
          // close pending requests that aren't attached to a connection yet
          req.callbacks.error(
            TRPCClientError.from(
              new TRPCWebSocketClosedError({
                message: 'Closed before connection was established',
              }),
            ),
          );
        }
      }
      if (activeConnection) {
        closeIfNoPending(activeConnection);
      }
      clearTimeout(connectTimer);
      connectTimer = undefined;
      activeConnection = null;
    },
    request,
    get connection() {
      return activeConnection;
    },
    /**
     * Reconnect to the WebSocket server
     */
    reconnect,
    connectionState: connectionState,
  };
}

/**
 * @see https://trpc.io/docs/v11/client/links/wsLink
 * @deprecated
 * 🙋‍♂️ **Contributors needed** to continue supporting WebSockets!
 * See https://github.com/trpc/trpc/issues/6109
 */
export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

/**
 * @see https://trpc.io/docs/v11/client/links/wsLink
 * @deprecated
 * 🙋‍♂️ **Contributors needed** to continue supporting WebSockets!
 * See https://github.com/trpc/trpc/issues/6109
 */
export type WebSocketLinkOptions<TRouter extends AnyRouter> = {
  client: TRPCWebSocketClient;
} & TransformerOptions<inferClientTypes<TRouter>>;
class TRPCWebSocketClosedError extends Error {
  constructor(opts?: { cause?: unknown; message?: string }) {
    super(
      opts?.message ?? 'WebSocket closed',
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore https://github.com/tc39/proposal-error-cause
      {
        cause: opts?.cause,
      },
    );
    this.name = 'TRPCWebSocketClosedError';
    Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
  }
}

/**
 * @see https://trpc.io/docs/v11/client/links/wsLink
 * @deprecated
 * 🙋‍♂️ **Contributors needed** to continue supporting WebSockets!
 * See https://github.com/trpc/trpc/issues/6109
 */
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  const transformer = getTransformer(opts.transformer);
  return () => {
    const { client } = opts;
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, id, context } = op;

        const input = transformer.input.serialize(op.input);

        const connState =
          type === 'subscription'
            ? client.connectionState.subscribe({
                next(result) {
                  observer.next({
                    result,
                    context,
                  });
                },
              })
            : null;
        const unsubscribeRequest = client.request({
          op: { type, path, input, id, context, signal: null },
          callbacks: {
            error(err) {
              observer.error(err);
              unsubscribeRequest();
            },
            complete() {
              observer.complete();
            },
            next(event) {
              const transformed = transformResult(event, transformer.output);

              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({
                result: transformed.result,
              });

              if (op.type !== 'subscription') {
                // if it isn't a subscription we don't care about next response

                unsubscribeRequest();
                observer.complete();
              }
            },
          },
          lastEventId: undefined,
        });
        return () => {
          unsubscribeRequest();
          connState?.unsubscribe();
        };
      });
    };
  };
}
