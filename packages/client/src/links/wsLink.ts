import { AnyRouter, inferRouterError, ProcedureType } from '@trpc/server';
import { observable, Observer, UnsubscribeFn } from '@trpc/server/observable';
import {
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
  TRPCResponseMessage,
} from '@trpc/server/rpc';
import { MaybePromise } from '@trpc/server/unstableInternalsExport';
import { retryDelay } from '../internals/retryDelay';
import { transformResult } from '../shared/transformResult';
import { TRPCClientError } from '../TRPCClientError';
import { Operation, TRPCLink } from './types';

const run = <TResult>(fn: () => TResult): TResult => fn();

type WSCallbackResult<TRouter extends AnyRouter, TOutput> = TRPCResponseMessage<
  TOutput,
  inferRouterError<TRouter>
>;

type WSCallbackObserver<TRouter extends AnyRouter, TOutput> = Observer<
  WSCallbackResult<TRouter, TOutput>,
  TRPCClientError<TRouter>
>;

export interface WebSocketClientOptions {
  url: string | (() => MaybePromise<string>);
  WebSocket?: typeof WebSocket;
  retryDelayMs?: typeof retryDelay;
  onOpen?: () => void;
  onClose?: (cause?: { code?: number }) => void;
}

export function createWSClient(opts: WebSocketClientOptions) {
  const {
    url,
    WebSocket: WebSocketImpl = WebSocket,
    retryDelayMs: retryDelayFn = retryDelay,
    onOpen,
    onClose,
  } = opts;
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
  type TRequest = {
    /**
     * Reference to the WebSocket instance this request was made to
     */
    connection: Connection | null;
    type: ProcedureType;
    callbacks: TCallbacks;
    op: Operation;
  };
  const pendingRequests: Record<number | string, TRequest> =
    Object.create(null);
  let connectAttempt = 0;
  let connectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let connectionIndex = 0;
  let activeConnection: null | Connection = createConnection();
  /**
   * Global connection has been killed
   */
  let killed = false;

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

  /**
   * tries to send the list of messages
   */
  function dispatch() {
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
    });
  }
  function tryReconnect() {
    if (!!connectTimer || killed) {
      return;
    }
    const timeout = retryDelayFn(connectAttempt++);
    reconnectInMs(timeout);
  }
  function reconnect() {
    const oldConnection = activeConnection;
    activeConnection = createConnection();
    oldConnection && closeIfNoPending(oldConnection);
  }
  function reconnectInMs(ms: number) {
    if (connectTimer) {
      return;
    }
    connectTimer = setTimeout(reconnect, ms);
  }

  function closeIfNoPending(conn: Connection) {
    // disconnect as soon as there are are no pending result
    const hasPendingRequests = Object.values(pendingRequests).some(
      (p) => p.connection === conn,
    );
    if (!hasPendingRequests) {
      conn.ws?.close();
    }
  }
  function resumeSubscriptionOnReconnect(req: TRequest) {
    if (outgoing.some((r) => r.id === req.op.id)) {
      return;
    }
    request(req.op, req.callbacks);
  }

  function createConnection(): Connection {
    const self: Connection = {
      id: ++connectionIndex,
      state: 'connecting',
    } as Connection;

    const onError = () => {
      self.state = 'closed';
      if (self === activeConnection) {
        tryReconnect();
      }
    };
    run(async () => {
      const urlString = typeof url === 'function' ? await url() : url;
      const ws = new WebSocketImpl(urlString);
      self.ws = ws;

      clearTimeout(connectTimer);
      connectTimer = undefined;

      ws.addEventListener('open', () => {
        /* istanbul ignore next -- @preserve */
        if (activeConnection?.ws !== ws) {
          return;
        }
        connectAttempt = 0;
        self.state = 'open';

        onOpen?.();
        dispatch();
      });
      ws.addEventListener('error', onError);
      const handleIncomingRequest = (req: TRPCClientIncomingRequest) => {
        if (self !== activeConnection) {
          return;
        }
        if (req.method === 'reconnect') {
          reconnect();
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
          // gracefully replace old connection with this
          const oldConn = req.connection;
          req.connection = self;
          oldConn && closeIfNoPending(oldConn);
        }

        if (
          'result' in data &&
          data.result.type === 'stopped' &&
          activeConnection === self
        ) {
          req.callbacks.complete();
        }
      };
      ws.addEventListener('message', ({ data }) => {
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
      });

      ws.addEventListener('close', ({ code }) => {
        if (self.state === 'open') {
          onClose?.({ code });
        }
        self.state = 'closed';

        if (activeConnection === self) {
          // connection might have been replaced already
          tryReconnect();
        }

        for (const [key, req] of Object.entries(pendingRequests)) {
          if (req.connection !== self) {
            continue;
          }

          if (self.state === 'closed') {
            // If the connection was closed, we just call `complete()` on the request
            delete pendingRequests[key];
            req.callbacks.complete?.();
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
              TRPCClientError.from(
                new TRPCWebSocketClosedError('WebSocket closed prematurely'),
              ),
            );
          }
        }
      });
    }).catch(onError);
    return self;
  }

  function request(op: Operation, callbacks: TCallbacks): UnsubscribeFn {
    const { type, input, path, id } = op;
    const envelope: TRPCRequestMessage = {
      id,
      method: type,
      params: {
        input,
        path,
      },
    };
    pendingRequests[id] = {
      connection: null,
      type,
      callbacks,
      op,
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
    };
  }
  return {
    close: () => {
      killed = true;

      for (const req of Object.values(pendingRequests)) {
        if (req.type === 'subscription') {
          req.callbacks.complete();
        } else if (!req.connection) {
          // close pending requests that aren't attached to a connection yet
          req.callbacks.error(
            TRPCClientError.from(
              new Error('Closed before connection was established'),
            ),
          );
        }
      }
      activeConnection && closeIfNoPending(activeConnection);
      clearTimeout(connectTimer);

      connectTimer = undefined;
    },
    request,
    getConnection() {
      return activeConnection;
    },
  };
}
export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export interface WebSocketLinkOptions {
  client: TRPCWebSocketClient;
}
class TRPCWebSocketClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TRPCWebSocketClosedError';
    Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
  }
}

/**
 * @see https://trpc.io/docs/client/links/wsLink
 */
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions,
): TRPCLink<TRouter> {
  return (runtime) => {
    const { client } = opts;
    return ({ op }) => {
      return observable((observer) => {
        const { type, path, id, context } = op;

        const input = runtime.transformer.serialize(op.input);

        const unsub = client.request(
          { type, path, input, id, context },
          {
            error(err) {
              observer.error(err as TRPCClientError<any>);
              unsub();
            },
            complete() {
              observer.complete();
            },
            next(message) {
              const transformed = transformResult(message, runtime);

              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({
                result: transformed.result,
              });

              if (op.type !== 'subscription') {
                // if it isn't a subscription we don't care about next response

                unsub();
                observer.complete();
              }
            },
          },
        );
        return () => {
          unsub();
        };
      });
    };
  };
}
