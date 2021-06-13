/* istanbul ignore file */

import { AnyRouter, ProcedureType, TRPCProcedureEnvelope } from '@trpc/server';
import {
  JSONRPC2RequestEnvelope,
  JSONRPC2ResponseEnvelope,
} from '@trpc/server/ws';
import { TRPCClientError } from '../createTRPCClient';
import {
  observable,
  observableSubject,
  ObservableCallbacks,
  UnsubscribeFn,
} from '../internals/observable';
import { TRPCLink } from './core';

export function createWSClient(opts: { url: string; WebSocket?: WebSocket }) {
  const { url, WebSocket: WebSocketImpl = WebSocket } = opts;
  if (!WebSocketImpl) {
    throw new Error(
      "No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill",
    );
  }
  const $isOpen = observableSubject(false);
  const $incomingEnvelopes = observable<JSONRPC2ResponseEnvelope>();

  let idCounter = 0;
  const outgoing: JSONRPC2RequestEnvelope[] = [];
  function triggerSendIfConnected() {
    if (!$isOpen.get()) {
      return;
    }
    while (true) {
      const msg = outgoing.shift();
      if (!msg) {
        break;
      }
      $ws.get().send(JSON.stringify(msg));
    }
  }

  function createWS() {
    const ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      $isOpen.next(true);

      // FIXME gracefully reconnect if gotten told to do so
      $ws.next(ws);
      triggerSendIfConnected();
    });
    ws.addEventListener('message', (msg) => {
      try {
        const json = JSON.parse(msg.data);
        $incomingEnvelopes.next(json);
      } catch (err) {
        // do something?
      }
    });

    // FIXME handle reconnect
    // FIXME handle graceful reconnect - server restarts etc
    return ws;
  }
  const $ws = observableSubject(createWS());

  function request(
    op: {
      type: ProcedureType;
      input: unknown;
      path: string;
    },
    handlers: ObservableCallbacks<JSONRPC2ResponseEnvelope, unknown>,
  ): UnsubscribeFn {
    const { type, input, path } = op;
    const id = idCounter++;
    const envelope: JSONRPC2RequestEnvelope = {
      id,
      jsonrpc: '2.0',
      method: type,
      params: {
        input,
        path,
      },
    };
    const $res = observable<JSONRPC2ResponseEnvelope, unknown>();
    $res.subscribe(handlers);
    const unsub = $incomingEnvelopes.subscribe({
      onNext(envelope) {
        if (envelope.id !== id) {
          return;
        }
        $res.next(envelope);
      },
      onError() {
        // FIXME
      },
    });

    // enqueue message
    outgoing.push(envelope);
    triggerSendIfConnected();

    return () => {
      unsub();
      $res.done();
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
      $ws.get().close();
    },
    request,
  };
}
export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export interface WebSocketLinkOptions {
  client: TRPCWebSocketClient;
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
              unsub();
            }
          },
        },
      );
      onDestroy(() => {
        unsub();
      });
    };
  };
}
