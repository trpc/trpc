import type { WebSocket, TemplatedApp, HttpRequest } from 'uWebSockets.js';
import { TRPCError, getTRPCErrorFromUnknown } from '../../error/TRPCError';
import { Unsubscribable, isObservable } from '../../observable/index';
import type {
  JSONRPC2,
  TRPCClientOutgoingMessage,
  TRPCReconnectNotification,
  TRPCResponseMessage,
} from '../../rpc/index';
import type { inferRouterContext } from '../../core/types';
import type { MaybePromise } from '../../types';
import type { BaseHandlerOptions } from '../../internals/types';
import { AnyRouter, callProcedure } from '../../core/router';
import { transformTRPCResponse } from '../../internals/transformTRPCResponse';
import type { NodeHTTPCreateContextOption } from '../node-http/types';
import { getCauseFromUnknown } from '../../error/utils';
import { parseMessage } from '../ws';

type UserData<TRouter extends AnyRouter> = {
  id: string;
  req: HttpRequest;
  ctxPromise: MaybePromise<inferRouterContext<TRouter>> | undefined;
};

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> = BaseHandlerOptions<
  TRouter,
  HttpRequest
> &
  NodeHTTPCreateContextOption<TRouter, HttpRequest, null> & {
    app: TemplatedApp;
    prefix: string;
    process?: NodeJS.Process;
  };

export const applyWSSHandler = <TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>
) => {
  const { app, prefix, createContext, router } = opts;

  const { transformer } = router._def._config;

  const randomKey = Math.random().toString(36).slice(2);

  const broadcastKey = `${randomKey}-broadcastReconnectNotification`;

  const allClientsSubscriptions = new Map<
    string,
    Map<number | string, Unsubscribable>
  >();

  const respond = (
    client: WebSocket<UserData<TRouter>>,
    untransformedJSON: TRPCResponseMessage
  ) => {
    client.send(
      JSON.stringify(transformTRPCResponse(router, untransformedJSON))
    );
  };

  const stopSubscription = (
    client: WebSocket<UserData<TRouter>>,
    subscription: Unsubscribable,
    { id, jsonrpc }: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId }
  ) => {
    subscription.unsubscribe();

    respond(client, {
      id,
      jsonrpc,
      result: {
        type: 'stopped',
      },
    });
  };

  const handleRequest = async (
    client: WebSocket<UserData<TRouter>>,
    msg: TRPCClientOutgoingMessage
  ) => {
    const wsData = client.getUserData();
    let clientsSubscriptions = allClientsSubscriptions.get(wsData.id);
    if (!clientsSubscriptions) {
      clientsSubscriptions = new Map();
      allClientsSubscriptions.set(wsData.id, clientsSubscriptions);
    }

    if (!clientsSubscriptions) {
      throw new Error('no clientsSubscriptions');
    }

    const { id, jsonrpc } = msg;

    if (id === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '`id` is required',
      });
    }
    if (msg.method === 'subscription.stop') {
      if (clientsSubscriptions) {
        const sub = clientsSubscriptions.get(id);
        if (sub) {
          stopSubscription(client, sub, { id, jsonrpc });
        }
        clientsSubscriptions.delete(id);
      }
      return;
    }
    const { path, input } = msg.params;
    let ctx: inferRouterContext<TRouter> | undefined = undefined;
    const type = msg.method;
    try {
      ctx = await wsData.ctxPromise; // asserts context has been set

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
        respond(client, {
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
          respond(client, {
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
          opts.onError?.({
            error,
            path,
            type,
            ctx,
            req: wsData.req,
            input,
          });
          respond(client, {
            id,
            jsonrpc,
            error: router.getErrorShape({
              error,
              type,
              path,
              input,
              ctx,
            }),
          });
        },
        complete() {
          respond(client, {
            id,
            jsonrpc,
            result: {
              type: 'stopped',
            },
          });
        },
      });

      // if (client.readyState !== client.OPEN) {
      //   // if the client got disconnected whilst initializing the subscription
      //   // no need to send stopped message if the client is disconnected
      //   sub.unsubscribe();
      //   return;
      // }

      if (clientsSubscriptions.has(id)) {
        // duplicate request ids for client
        stopSubscription(client, sub, { id, jsonrpc });
        throw new TRPCError({
          message: `Duplicate id ${id}`,
          code: 'BAD_REQUEST',
        });
      }
      clientsSubscriptions.set(id, sub);

      respond(client, {
        id,
        jsonrpc,
        result: {
          type: 'started',
        },
      });
    } catch (cause) {
      // procedure threw an error
      const error = getTRPCErrorFromUnknown(cause);
      opts.onError?.({ error, path, type, ctx, req: wsData.req, input });
      respond(client, {
        id,
        jsonrpc,
        error: router.getErrorShape({
          error,
          type,
          path,
          input,
          ctx,
        }),
      });
    }
  };

  app.ws<UserData<TRouter>>(prefix, {
    // compression: SHARED_COMPRESSOR,
    // maxPayloadLength: 5 * 1024 * 1024,
    // maxBackpressure,
    // idleTimeout: ms.minutes(5) / 1000,
    close: (ws) => {
      const id = ws.getUserData().id;
      const clientSubs = allClientsSubscriptions.get(id);
      if (!clientSubs) {
        return;
      }
      for (const sub of clientSubs.values()) {
        sub.unsubscribe();
      }
      clientSubs.clear();
      allClientsSubscriptions.delete(id);
    },
    message: async (client, message) => {
      try {
        const received = Buffer.from(message.slice(0)).toString();
        const msgJSON: unknown = JSON.parse(received);
        const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
        const promises = msgs
          .map((raw) => parseMessage(raw, transformer))
          .map((msg) => handleRequest(client, msg));
        await Promise.all(promises);
      } catch (cause) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          cause: getCauseFromUnknown(cause),
        });

        respond(client, {
          id: null,
          error: router.getErrorShape({
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx: undefined,
          }),
        });
      }
    },
    upgrade: (res, req, context) => {
      /* You MUST register an abort handler to know if the upgrade was aborted by peer */
      res.onAborted(() => {
        /* We can simply signal that we were aborted */
        upgradeAborted.aborted = true;
      });

      /* Keep track of abortions */
      const upgradeAborted = { aborted: false };

      /* You MUST copy data out of req here, as req is only valid within this immediate callback */
      const secWebSocketKey = req.getHeader('sec-websocket-key');
      const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
      const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');

      if (upgradeAborted.aborted) {
        /* You must not upgrade now */
        return;
      }

      res.writeStatus('101 Switching Protocols');

      const data: UserData<TRouter> = {
        id: Math.random().toString(36).slice(2),
        req,
        ctxPromise: undefined,
      };

      /* This immediately calls open handler, you must not use res after this call */
      res.upgrade(
        data,
        /* Use our copies here */
        secWebSocketKey,
        secWebSocketProtocol,
        secWebSocketExtensions,
        context
      );
    },
    open: async (client) => {
      client.subscribe(broadcastKey);
      const wsData = client.getUserData();

      wsData.ctxPromise = createContext?.({ req: wsData.req, res: null });
      let ctx: inferRouterContext<TRouter> | undefined = undefined;

      // WebSocket errors should be handled, as otherwise unhandled exceptions will crash Node.js.
      // This line was introduced after the following error brought down production systems:
      // "RangeError: Invalid WebSocket frame: RSV2 and RSV3 must be clear"
      // Here is the relevant discussion: https://github.com/websockets/ws/issues/1354#issuecomment-774616962
      // client.on('error', (cause) => {
      //   opts.onError?.({
      //     ctx,
      //     error: getTRPCErrorFromUnknown(cause),
      //     input: undefined,
      //     path: undefined,
      //     type: 'unknown',
      //     req,
      //   });
      // });
      const createContextAsync = async () => {
        try {
          ctx = await wsData.ctxPromise;
        } catch (cause) {
          const error = getTRPCErrorFromUnknown(cause);
          opts.onError?.({
            error,
            path: undefined,
            type: 'unknown',
            ctx,
            req: wsData.req,
            input: undefined,
          });
          respond(client, {
            id: null,
            error: router.getErrorShape({
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
      };
      await createContextAsync();
    },
  });

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);
      app.publish(broadcastKey, data);
      // for (const client of wss.clients) {
      //   if (client.readyState === 1 /* ws.OPEN */) {
      //     client.send(data);
      //   }
      // }
    },
  };
};
