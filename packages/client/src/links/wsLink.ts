import {
  AnyRouter,
  JSONRPC2ResponseEnvelope,
  TRPCProcedureEnvelope,
  JSONRPC2RequestEnvelope,
} from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { observableSubject } from '../internals/observable';
import { TRPCLink } from './core';

export interface WebSocketLinkOptions {
  ws: WebSocket;
}
export function wsLink<TRouter extends AnyRouter>(
  opts: WebSocketLinkOptions,
): TRPCLink<TRouter> {
  // initialized config
  return (rt) => {
    // connect to WSS
    let requestId = 0;
    const { ws } = opts;
    const $open = observableSubject(false);
    const listeners = new Map<
      number,
      (
        opts: TRPCProcedureEnvelope<
          TRouter,
          unknown
        > /* | Error | CloseEvent */,
      ) => void
    >();

    ws.addEventListener('message', (msg) => {
      try {
        const { id, result } = rt.transformer.deserialize(
          JSON.parse(msg.data),
        ) as JSONRPC2ResponseEnvelope<TRPCProcedureEnvelope<TRouter, unknown>>;
        const listener = listeners.get(id);
        if (!listener) {
          // FIXME do something
          return;
        }
        listener(result);
      } catch (err) {
        // FIXME do something?
      }
    });
    ws.addEventListener('open', () => {
      $open.set(true);
    });

    function send(req: JSONRPC2RequestEnvelope) {
      ws.send(JSON.stringify(rt.transformer.serialize(req)));
    }

    return ({ op, prev, onDestroy }) => {
      requestId++;
      if (listeners.get(requestId)) {
        // should never happen
        prev(new Error(`Duplicate requestId ${requestId}`));
        return;
      }
      let unsub$open: null | (() => void) = null;
      let unsub$result: null | (() => void) = null;

      function exec() {
        unsub$open?.();
        const { input, type, path } = op;
        listeners.set(requestId, (result) => {
          prev(result.ok ? result : TRPCClientError.from(result));
        });
        send({
          id: requestId,
          method: type,
          params: {
            input,
            path,
          },
          jsonrpc: '2.0',
        });
        unsub$result = () => {
          send({
            id: requestId,
            method: 'stop',
            jsonrpc: '2.0',
          });
          listeners.delete(requestId);
        };
      }
      if ($open.get()) {
        exec();
      } else {
        unsub$open = $open.subscribe(exec);
      }
      onDestroy(() => {
        unsub$open?.();
        unsub$result?.();
      });
    };
  };
}
