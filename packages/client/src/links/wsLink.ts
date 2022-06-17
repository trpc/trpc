import { AnyRouter, ProcedureType } from '@trpc/server';
import {
  TRPCClientIncomingMessage,
  TRPCClientIncomingRequest,
  TRPCRequest,
  TRPCResponse,
  TRPCResult,
} from '@trpc/server/rpc';
import { TRPCErrorResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { ObservableCallbacks, UnsubscribeFn } from '../internals/observable';
import { retryDelay } from '../internals/retryDelay';
import { TRPCLink } from './core';

type Operation = {
  id: number | string;
  type: ProcedureType;
  input: unknown;
  path: string;
};
export interface WebSocketClientOptions {
  url: string;
  WebSocket?: typeof WebSocket;
  retryDelayMs?: typeof retryDelay;
}
export function createWSClient(opts: WebSocketClientOptions) {
  const {
    url,
    WebSocket: WebSocketImpl = WebSocket,
    retryDelayMs: retryDelayFn = retryDelay,
  } = opts;
  /* istanbul ignore next */
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  /**
   * outgoing messages buffer whilst not open
   */
  let outgoing: TRPCRequest[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  type TCallbacks = ObservableCallbacks<
    TRPCResult,
    TRPCClientError<AnyRouter> | TRPCErrorResponse
  >;
  type TRequest = {
    /**
     * Reference to the WebSocket instance this request was made to
     */
    ws: WebSocket;
    type: ProcedureType;
    callbacks: TCallbacks;
    op: Operation;
  };
  const pendingRequests: Record<number | string, TRequest> =
    Object.create(null);
  let connectAttempt = 0;
  let dispatchTimer: NodeJS.Timer | number | null = null;
  let connectTimer: NodeJS.Timer | number | null = null;
  let activeConnection = createWS();
  let state: 'open' | 'connecting' | 'closed' = 'connecting';
  /**
   * tries to send the list of messages
   */
  function dispatch() {
    if (state !== 'open' || dispatchTimer) {
      return;
    }
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;

      if (outgoing.length === 1) {
        // single send
        activeConnection.send(JSON.stringify(outgoing.pop()));
      } else {
        // batch send
        activeConnection.send(JSON.stringify(outgoing));
      }
      // clear
      outgoing = [];
    });
  }
  function tryReconnect() {
    if (connectTimer || state === 'closed') {
      return;
    }
    const timeout = retryDelayFn(connectAttempt++);
    reconnectInMs(timeout);
  }
  function reconnect() {
    state = 'connecting';
    const oldConnection = activeConnection;
    activeConnection = createWS();
    closeIfNoPending(oldConnection);
  }
  function reconnectInMs(ms: number) {
    if (connectTimer) {
      return;
    }
    state = 'connecting';
    connectTimer = setTimeout(reconnect, ms);
  }

  function closeIfNoPending(conn: WebSocket) {
    // disconnect as soon as there are are no pending result
    const hasPendingRequests = Object.values(pendingRequests).some(
      (p) => p.ws === conn,
    );
    if (!hasPendingRequests) {
      conn.close();
    }
  }

  function resumeSubscriptionOnReconnect(req: TRequest) {
    if (outgoing.some((r) => r.id === req.op.id)) {
      return;
    }
    request(req.op, req.callbacks);
  }

  function createWS() {
    const conn = new WebSocketImpl(url);
    clearTimeout(connectTimer as any);
    connectTimer = null;

    conn.addEventListener('open', () => {
      /* istanbul ignore next */
      if (conn !== activeConnection) {
        return;
      }
      connectAttempt = 0;
      state = 'open';
      dispatch();
    });
    conn.addEventListener('error', () => {
      if (conn === activeConnection) {
        tryReconnect();
      }
    });
    const handleIncomingRequest = (req: TRPCClientIncomingRequest) => {
      if (req.method === 'reconnect' && conn === activeConnection) {
        reconnect();
        // notify subscribers
        for (const pendingReq of Object.values(pendingRequests)) {
          if (pendingReq.type === 'subscription') {
            resumeSubscriptionOnReconnect(pendingReq);
          }
        }
      }
    };
    const handleIncomingResponse = (res: TRPCResponse) => {
      const req = res.id !== null && pendingRequests[res.id];
      if (!req) {
        // do something?
        return;
      }
      if ('error' in res) {
        req.callbacks.onError?.(res);
        return;
      }

      req.callbacks.onNext?.(res.result);
      if (req.ws !== activeConnection && conn === activeConnection) {
        const oldWs = req.ws;
        // gracefully replace old connection with this
        req.ws = activeConnection;
        closeIfNoPending(oldWs);
      }

      if (res.result.type === 'stopped' && conn === activeConnection) {
        req.callbacks.onDone?.();
      }
    };
    conn.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data) as TRPCClientIncomingMessage;

      if ('method' in msg) {
        handleIncomingRequest(msg);
      } else {
        handleIncomingResponse(msg);
      }
      if (conn !== activeConnection || state === 'closed') {
        // when receiving a message, we close old connection that has no pending requests
        closeIfNoPending(conn);
      }
    });

    conn.addEventListener('close', () => {
      if (activeConnection === conn) {
        // connection might have been replaced already
        tryReconnect();
      }

      for (const key in pendingRequests) {
        const req = pendingRequests[key];
        if (req.ws !== conn) {
          continue;
        }
        req.callbacks.onError?.(
          TRPCClientError.from(
            new TRPCWebSocketClosedError('WebSocket closed prematurely'),
          ),
        );
        if (req.type !== 'subscription') {
          delete pendingRequests[key];
          req.callbacks.onDone?.();
        } else if (state !== 'closed') {
          // request restart of sub with next connection
          resumeSubscriptionOnReconnect(req);
        }
      }
    });
    return conn;
  }

  function request(op: Operation, callbacks: TCallbacks): UnsubscribeFn {
    const { type, input, path, id } = op;
    const envelope: TRPCRequest = {
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
      op,
    };

    // enqueue message
    outgoing.push(envelope);
    dispatch();

    return () => {
      const callbacks = pendingRequests[id]?.callbacks;
      delete pendingRequests[id];
      outgoing = outgoing.filter((msg) => msg.id !== id);

      callbacks?.onDone?.();
      if (op.type === 'subscription') {
        outgoing.push({
          id,
          method: 'subscription.stop',
          params: undefined,
        });
        dispatch();
      }
    };
  }
  return {
    close: () => {
      state = 'closed';
      closeIfNoPending(activeConnection);
      clearTimeout(connectTimer as any);
      connectTimer = null;
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

class TRPCSubscriptionEndedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TRPCSubscriptionEndedError';
    Object.setPrototypeOf(this, TRPCSubscriptionEndedError.prototype);
  }
}

export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions,
): TRPCLink<TRouter> {
  // initialized config
  return (rt) => {
    const { client } = opts;

    return ({ op, prev, onDestroy }) => {
      const { type, input: rawInput, path, id } = op;
      const input = rt.transformer.serialize(rawInput);
      let isDone = false;
      const unsub = client.request(
        { type, path, input, id },
        {
          onNext(result) {
            if (isDone) {
              return;
            }
            if ('data' in result) {
              const data = rt.transformer.deserialize(result.data);
              prev({ type: 'data', data });
            } else {
              prev(result);
            }

            if (op.type !== 'subscription') {
              // if it isn't a subscription we don't care about next response
              isDone = true;
              unsub();
            }
          },
          onError(err) {
            if (isDone) {
              return;
            }
            prev(
              err instanceof Error
                ? err
                : TRPCClientError.from({
                    ...err,
                    error: rt.transformer.deserialize(err.error),
                  }),
            );
          },
          onDone() {
            if (isDone) {
              return;
            }
            const result = new TRPCSubscriptionEndedError(
              'Operation ended prematurely',
            );

            prev(TRPCClientError.from(result, { isDone: true }));
            isDone = true;
          },
        },
      );
      onDestroy(() => {
        isDone = true;
        unsub();
      });
    };
  };
}
