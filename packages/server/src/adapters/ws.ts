import type { IncomingMessage } from 'http';
import type { WebSocket, WebSocketServer } from 'ws';
import type { AnyRouter, inferRouterContext } from '../core';
import { callProcedure } from '../core';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { BaseHandlerOptions } from '../internals/types';
import type { Unsubscribable } from '../observable';
import { isObservable } from '../observable';
import type {
  JSONRPC2,
  TRPCClientOutgoingMessage,
  TRPCReconnectNotification,
  TRPCResponseMessage,
} from '../rpc';
import { parseTRPCMessage } from '../rpc';
import { getErrorShape } from '../shared/getErrorShape';
import { transformTRPCResponse } from '../shared/transformTRPCResponse';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPCreateContextOption,
} from './node-http';

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> = BaseHandlerOptions<
  TRouter,
  IncomingMessage
> &
  NodeHTTPCreateContextOption<TRouter, IncomingMessage, WebSocket> & {
    wss: WebSocketServer;
    process?: NodeJS.Process;
  };

export type CreateWSSContextFnOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  WebSocket
>;

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { wss, createContext, router } = opts;

  const { transformer } = router._def._config;
  wss.on('connection', async (client, req) => {
    const clientSubscriptions = new Map<number | string, Unsubscribable>();

    function respond(untransformedJSON: TRPCResponseMessage) {
      client.send(
        JSON.stringify(
          transformTRPCResponse(router._def._config, untransformedJSON),
        ),
      );
    }

    function stopSubscription(
      subscription: Unsubscribable,
      { id, jsonrpc }: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId },
    ) {
      subscription.unsubscribe();

      respond({
        id,
        jsonrpc,
        result: {
          type: 'stopped',
        },
      });
    }

    const ctxPromise = createContext?.({ req, res: client });
    let ctx: inferRouterContext<TRouter> | undefined = undefined;

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
        const sub = clientSubscriptions.get(id);
        if (sub) {
          stopSubscription(sub, { id, jsonrpc });
        }
        clientSubscriptions.delete(id);
        return;
      }
      const { path, input } = msg.params;
      const type = msg.method;
      try {
        await ctxPromise; // asserts context has been set

        const result = await callProcedure({
          procedures: router._def.procedures,
          path,
          rawInput: input,
          ctx,
          type,
        });

        if (type === 'subscription') {
          if (!isObservable(result)) {
            throw new TRPCError({
              message: `Subscription ${path} did not return an observable`,
              code: 'INTERNAL_SERVER_ERROR',
            });
          }
        } else {
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

        const observable = result;
        const sub = observable.subscribe({
          next(data) {
            respond({
              id,
              jsonrpc,
              result: {
                type: 'data',
                data,
              },
            });
          },
          error(err) {
            const error = getTRPCErrorFromUnknown(err);
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
          },
          complete() {
            respond({
              id,
              jsonrpc,
              result: {
                type: 'stopped',
              },
            });
          },
        });
        /* istanbul ignore next -- @preserve */
        if (client.readyState !== client.OPEN) {
          // if the client got disconnected whilst initializing the subscription
          // no need to send stopped message if the client is disconnected
          sub.unsubscribe();
          return;
        }

        /* istanbul ignore next -- @preserve */
        if (clientSubscriptions.has(id)) {
          // duplicate request ids for client
          stopSubscription(sub, { id, jsonrpc });
          throw new TRPCError({
            message: `Duplicate id ${id}`,
            code: 'BAD_REQUEST',
          });
        }
        clientSubscriptions.set(id, sub);

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
    client.on('message', async (message) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const msgJSON: unknown = JSON.parse(message.toString());
        const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
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
        sub.unsubscribe();
      }
      clientSubscriptions.clear();
    });
    async function createContextAsync() {
      try {
        ctx = await ctxPromise;
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
        (global.setImmediate ?? global.setTimeout)(() => {
          client.close();
        });
      }
    }
    await createContextAsync();
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);
      for (const client of wss.clients) {
        if (client.readyState === 1 /* ws.OPEN */) {
          client.send(data);
        }
      }
    },
  };
}
