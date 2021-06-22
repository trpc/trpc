import { AnyRouter, ProcedureType } from '@trpc/server';
import {
  TRPCClientIncomingMessage,
  TRPCRequest,
  TRPCResult,
} from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { ObservableCallbacks, UnsubscribeFn } from '../internals/observable';
import { retryDelay } from '../internals/retryDelay';
import { TRPCLink } from './core';
import { TRPCAbortError } from '../internals/TRPCAbortErrorSignal';
import {
  TRPCClientIncomingRequest,
  TRPCResponse,
} from 'packages/server/src/rpc';

export function createWSClient(opts: {
  url: string;
  WebSocket?: WebSocket;
  retryDelayMs?: typeof retryDelay;
  /**
   * If the server emits a `reconnect` event
   * @default 3000
   */
  staleConnectionTimeoutMs?: number;
}) {
  const {
    url,
    WebSocket: WebSocketImpl = WebSocket,
    retryDelayMs: retryDelayFn = retryDelay,
    staleConnectionTimeoutMs = 3000,
  } = opts;
  /* istanbul ignore next */
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  let isClosed = false;
  /**
   * outgoing messages buffer whilst not open
   */
  const outgoing: TRPCRequest[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  type TCallbacks = ObservableCallbacks<TRPCResult, TRPCClientError<AnyRouter>>;
  const pendingRequests: Record<
    number | string,
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
      while (outgoing.length) {
        outgoing.pop();
      }
    });
  }
  function tryReconnect() {
    if (connectTimer || isClosed) {
      return;
    }
    const timeout = retryDelayFn(connectAttempt++);
    reconnectInMs(timeout);
  }
  function reconnect() {
    state = 'connecting';
    const oldConnection = activeConnection;
    setTimeout(() => {
      oldConnection.close();
    }, staleConnectionTimeoutMs);
    activeConnection = createWS();
  }
  function reconnectInMs(ms: number) {
    if (connectTimer) {
      return;
    }
    state = 'connecting';
    connectTimer = setTimeout(reconnect, ms);
  }

  function closeIfNoPending(conn: WebSocket) {
    state = 'closed';
    // disconnect as soon as there are is not pending result
    const hasPendingRequests = Object.values(pendingRequests).some(
      (p) => p.ws === conn,
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
      dispatch();
    });
    conn.addEventListener('error', () => {
      tryReconnect();
    });
    const handleIncomingRequest = (req: TRPCClientIncomingRequest) => {
      if (req.method === 'reconnect' && conn === activeConnection) {
        reconnect();
        // notify subscribers
        for (const p of Object.values(pendingRequests)) {
          if (p.type === 'subscription') {
            p.callbacks.onError?.(
              TRPCClientError.from(new TRPCReconnectError()),
            );
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
        req.callbacks.onError?.(TRPCClientError.from(res));
        return;
      }

      req.callbacks.onNext?.(res.result);

      if (res.result.type === 'stopped') {
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
        setTimeout(() => {
          // when receiving a message, we close old connection that has no pending requests
          closeIfNoPending(conn);
        }, 1);
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
      id: number | string;
      type: ProcedureType;
      input: unknown;
      path: string;
    },
    callbacks: TCallbacks,
  ): UnsubscribeFn {
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
    };

    // enqueue message
    outgoing.push(envelope);
    dispatch();

    return () => {
      const callbacks = pendingRequests[id]?.callbacks;
      delete pendingRequests[id];

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
class TRPCWebSocketClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TRPCWebSocketClosedError';
    Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
  }
}

class TRPCReconnectError extends Error {
  constructor() {
    super('TRPCReconnectError');
    this.name = 'TRPCReconnectError';
    Object.setPrototypeOf(this, TRPCReconnectError.prototype);
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
      let unsubbed = false;
      const unsub = client.request(
        { type, path, input, id },
        {
          onNext(result) {
            if ('data' in result) {
              const data = rt.transformer.deserialize(result.data);
              prev({ type: 'data', data });
            } else {
              prev(result);
            }

            if (op.type !== 'subscription') {
              // if it isn't a subscription we don't care about next response
              unsubbed = true;
              unsub();
            }
          },
          onError(err) {
            prev(TRPCClientError.from(err));
          },
          onDone() {
            const result = unsubbed
              ? new TRPCAbortError()
              : new TRPCWebSocketClosedError('Operation ended prematurely');

            prev(TRPCClientError.from(result, { isDone: true }));
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
