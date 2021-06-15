import { AnyRouter, ProcedureType } from '@trpc/server';
import {
  TRPCClientMessage,
  TRPCRequestEnvelope,
  TRPCResponseEnvelope,
  TRPCResult,
} from '@trpc/server/jsonrpc2';
import { TRPCClientError } from '../createTRPCClient';
import { ObservableCallbacks, UnsubscribeFn } from '../internals/observable';
import { retryDelay } from '../internals/retryDelay';
import { TRPCLink } from './core';

export function createWSClient(opts: {
  url: string;
  WebSocket?: WebSocket;
  retryDelayMs?: typeof retryDelay;
  /**
   * If the server emits a `reconnect` event
   * @default 1000
   */
  staleConnectionTimeoutMs?: number;
  reconnectDelayMs?: () => number;
}) {
  const {
    url,
    WebSocket: WebSocketImpl = WebSocket,
    retryDelayMs: retryDelayFn = retryDelay,
    staleConnectionTimeoutMs = 1000,
    reconnectDelayMs = () => 0,
  } = opts;
  /* istanbul ignore next */
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  let idCounter = 0;
  let isClosed = false;
  /**
   * outgoing messages buffer whilst not open
   */
  const outgoing: TRPCRequestEnvelope[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  type TCallbacks = ObservableCallbacks<TRPCResult, TRPCClientError<AnyRouter>>;
  const pendingRequests: Record<
    number,
    {
      /**
       * Reference to the WebSocket instance this request was made to
       */
      ws: WebSocket;
      type: ProcedureType;
      callbacks: TCallbacks;
    }
  > = Object.create(null);
  let connectAttempt = 0;
  let connectTimer: NodeJS.Timer | number | null = null;
  let activeConnection = createWS();
  let state: 'open' | 'connecting' | 'closed' = 'connecting';

  /**
   * tries to send the list of messages
   */
  function triggerSendIfConnected() {
    if (state !== 'open') {
      return;
    }
    while (true) {
      const msg = outgoing.shift();
      if (!msg) {
        break;
      }
      activeConnection.send(JSON.stringify(msg));
    }
  }
  function tryReconnect() {
    if (connectTimer || isClosed) {
      return;
    }
    const timeout = retryDelayFn(connectAttempt++);
    reconnectInMs(timeout);
  }
  function reconnectInMs(ms: number) {
    clearTimeout(connectTimer as any);
    state = 'connecting';
    const oldConnection = activeConnection;
    setTimeout(() => {
      oldConnection.close();
    }, staleConnectionTimeoutMs);
    connectTimer = setTimeout(() => {
      activeConnection = createWS();
    }, ms);
  }

  function closeIfNoPending(conn: WebSocket) {
    // disconnect as soon as there are no pending queries /  mutations
    const hasPendingRequests = Object.values(pendingRequests).some(
      (p) => p.ws === conn && p.type !== 'subscription',
    );
    if (!hasPendingRequests) {
      conn.close();
    }
  }

  function createWS() {
    const conn = new WebSocket(url);
    clearTimeout(connectTimer as any);
    connectTimer = null;

    conn.addEventListener('open', () => {
      connectAttempt = 0;
      state = 'open';
      triggerSendIfConnected();
    });
    conn.addEventListener('error', () => {
      tryReconnect();
    });
    conn.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data) as TRPCClientMessage;

      if (conn !== activeConnection) {
        setTimeout(() => {
          closeIfNoPending(conn);
        }, 1);
      }
      if ('method' in msg) {
        if (msg.method === 'reconnect' && conn === activeConnection) {
          reconnectInMs(reconnectDelayMs());
          return;
        }
        return;
      }

      const req = pendingRequests[msg.id];
      if (!req) {
        // do something?
        return;
      }
      if ('error' in msg) {
        req.callbacks.onError?.(TRPCClientError.from(msg));
        return;
      }
      if (msg.result.type === 'stopped') {
        req.callbacks.onNext?.(msg.result);
        req.callbacks.onDone?.();
      } else {
        req.callbacks.onNext?.(msg.result);
        return;
      }
    });

    conn.addEventListener('close', () => {
      if (activeConnection === conn) {
        // connection might have been replaced already
        tryReconnect();
      }

      for (const key in pendingRequests) {
        const req = pendingRequests[key];
        if (req.ws === conn) {
          delete pendingRequests[key];
          req.callbacks.onDone?.();
        }
      }
    });
    return conn;
  }

  function request(
    op: {
      type: ProcedureType;
      input: unknown;
      path: string;
    },
    callbacks: TCallbacks,
  ): UnsubscribeFn {
    const { type, input, path } = op;
    const id = ++idCounter;
    const envelope: TRPCRequestEnvelope = {
      id,
      jsonrpc: '2.0',
      method: type,
      params: {
        input,
        path,
      },
    };
    pendingRequests[id] = {
      ws: activeConnection,
      type,
      callbacks,
    };

    // enqueue message
    outgoing.push(envelope);
    triggerSendIfConnected();

    return () => {
      pendingRequests[id]?.callbacks.onDone?.();
      delete pendingRequests[id];
      if (op.type === 'subscription') {
        outgoing.push({
          id,
          method: 'subscription.stop',
          params: undefined,
        });
        triggerSendIfConnected();
      }
    };
  }
  return {
    close: () => {
      isClosed = true;
      closeIfNoPending(activeConnection);
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
export class WebSocketInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, WebSocketInterruptedError.prototype);
  }
}
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions,
): TRPCLink<TRouter> {
  // initialized config
  return (rt) => {
    const { client } = opts;

    return ({ op, prev, onDestroy }) => {
      const { type, input: rawInput, path } = op;
      const input = rt.transformer.serialize(rawInput);
      let unsubbed = false;
      const unsub = client.request(
        { type, path, input },
        {
          onNext(result) {
            if (result.type !== 'data') {
              // TODO
              return;
            }
            const data = rt.transformer.deserialize(result.data);
            prev(data);

            if (op.type !== 'subscription') {
              // if it isn't a subscription we don't care about next response
              unsubbed = true;
              unsub();
            }
          },
          // FIXME
          onError(err) {
            prev(TRPCClientError.from(err));
          },
          onDone() {
            if (!unsubbed) {
              prev(
                TRPCClientError.from(
                  new WebSocketInterruptedError('Operation ended prematurely'),
                  { isDone: true },
                ),
              );
            }
          },
        },
      );
      onDestroy(() => {
        unsubbed = true;
        unsub();
      });
    };
  };
}
