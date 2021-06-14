/* istanbul ignore file */

import { AnyRouter, ProcedureType, TRPCProcedureEnvelope } from '@trpc/server';
import {
  JSONRPC2RequestEnvelope,
  JSONRPC2ResponseEnvelope,
} from '@trpc/server/ws';
import { TRPCClientError } from '../createTRPCClient';
import { ObservableCallbacks, UnsubscribeFn } from '../internals/observable';
import { retryDelay } from '../internals/retryDelay';
import { TRPCLink } from './core';

export function createWSClient(opts: {
  url: string;
  WebSocket?: WebSocket;
  retryDelay?: typeof retryDelay;
}) {
  const {
    url,
    WebSocket: WebSocketImpl = WebSocket,
    retryDelay: retryDelayFn = retryDelay,
  } = opts;
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  let isConnected = false;
  let idCounter = 0;
  let isClosed = false;
  /**
   * outgoing messages buffer whilst disconnected
   */
  const outgoing: JSONRPC2RequestEnvelope[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  const pendingRequests: Record<
    number,
    {
      /**
       * Reference to the WebSocket instance this request was made to
       */
      ws: WebSocket;
      callbacks: ObservableCallbacks<
        JSONRPC2ResponseEnvelope,
        TRPCClientError<AnyRouter>
      >;
    }
  > = Object.create(null);
  let connectAttempt = 0;
  let connectTimer: NodeJS.Timer | number | null = null;
  let connection = createWS();

  /**
   * tries to send the list of messages
   */
  function triggerSendIfConnected() {
    if (!isConnected) {
      return;
    }
    while (true) {
      const msg = outgoing.shift();
      if (!msg) {
        break;
      }
      connection.send(JSON.stringify(msg));
    }
  }
  function tryReconnect() {
    if (connectTimer || isClosed) {
      return;
    }
    const timeout = retryDelayFn(connectAttempt++);
    connectTimer = setTimeout(createWS, timeout);
  }

  function createWS() {
    const newConnection = new WebSocket(url);
    connectTimer = null;

    newConnection.addEventListener('open', () => {
      isConnected = true;
      connectAttempt = 0;
      const oldConnection = connection;
      if (oldConnection !== newConnection) {
        // kill old connection after 1 second
        // when we do graceful restarts
        setTimeout(() => newConnection.close(), 1000);
      }
      connection = newConnection;

      triggerSendIfConnected();

      // TODO gracefully reconnect if server restarts
      // idea:
      // [ ] server broadcats specific msg
      // [ ] start new connection in background (with timeout/jitter)
      // [x] wait for all non-subscriptions to fail / wait for X seconds before timing out
      // [x] reconnect, trigger done on all pending sub envelopes
    });
    newConnection.addEventListener('error', () => {
      // FIXME -- could probably be handled better
      if (newConnection !== connection) {
        tryReconnect();
      }
    });
    newConnection.addEventListener('message', (msg) => {
      const json = JSON.parse(msg.data) as JSONRPC2ResponseEnvelope;
      const req = pendingRequests[json.id];
      if (!req) {
        // do something?
      } else {
        req.callbacks.onNext?.(json);
      }
      // if ws has been replaced, let's check if there are other pending requests
      // disconnect if none
    });

    newConnection.addEventListener('close', () => {
      if (connection === newConnection) {
        // connection might have been replaced already
        isConnected = false;
        tryReconnect();
      }

      // trigger `onDone()` on all pending requests
      // TODO maybe we should trigger a specific error too?
      for (const key in pendingRequests) {
        const req = pendingRequests[key];
        if (req.ws === newConnection) {
          req.callbacks.onDone?.();
          delete pendingRequests[key];
        }
      }
    });

    // FIXME handle reconnect
    // FIXME handle graceful reconnect - server restarts etc
    return newConnection;
  }

  function request(
    op: {
      type: ProcedureType;
      input: unknown;
      path: string;
    },
    callbacks: ObservableCallbacks<JSONRPC2ResponseEnvelope, unknown>,
  ): UnsubscribeFn {
    const { type, input, path } = op;
    const id = ++idCounter;
    const envelope: JSONRPC2RequestEnvelope = {
      id,
      jsonrpc: '2.0',
      method: type,
      params: {
        input,
        path,
      },
    };
    pendingRequests[id] = {
      ws: connection,
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
          method: 'stop',
          jsonrpc: '2.0',
        });
        triggerSendIfConnected();
      }
    };
  }
  return {
    close: () => {
      isClosed = true;
      connection.close();
    },
    request,
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
          onNext(envelope) {
            const data = rt.transformer.deserialize(
              envelope.result,
            ) as TRPCProcedureEnvelope<TRouter, unknown>;
            prev(data.ok ? data : TRPCClientError.from(data));

            if (op.type !== 'subscription') {
              // if it isn't a subscription we don't care about next response
              unsubbed = true;
              unsub();
            }
          },
          // // FIXME
          // onError() {
          // },
          onDone() {
            if (!unsubbed) {
              prev(
                TRPCClientError.from(
                  new WebSocketInterruptedError('Operation ended prematurely'),
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
