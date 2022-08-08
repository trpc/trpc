import http from 'http';
import ws from 'ws';
import { TRPCError } from '../TRPCError';
import { BaseHandlerOptions } from '../internals/baseHandlerOptions';
import { callProcedure } from '../internals/callProcedure';
import { getErrorFromUnknown } from '../internals/errors';
import { transformTRPCResponse } from '../internals/transformTRPCResponse';
import { AnyRouter, ProcedureType, inferRouterContext } from '../router';
import {
  TRPCErrorResponse,
  TRPCReconnectNotification,
  TRPCRequest,
  TRPCResponse,
} from '../rpc';
import { Subscription } from '../subscription';
import { CombinedDataTransformer } from '../transformer';
import { NodeHTTPCreateContextOption } from './node-http';

/* istanbul ignore next */
function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
    throw new Error('Not an object');
  }
}
/* istanbul ignore next */
function assertIsProcedureType(obj: unknown): asserts obj is ProcedureType {
  if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
    throw new Error('Invalid procedure type');
  }
}
/* istanbul ignore next */
function assertIsRequestId(
  obj: unknown,
): asserts obj is number | string | null {
  if (
    obj !== null &&
    typeof obj === 'number' &&
    isNaN(obj) &&
    typeof obj !== 'string'
  ) {
    throw new Error('Invalid request id');
  }
}
/* istanbul ignore next */
function assertIsString(obj: unknown): asserts obj is string {
  if (typeof obj !== 'string') {
    throw new Error('Invalid string');
  }
}
/* istanbul ignore next */
function assertIsJSONRPC2OrUndefined(
  obj: unknown,
): asserts obj is '2.0' | undefined {
  if (typeof obj !== 'undefined' && obj !== '2.0') {
    throw new Error('Must be JSONRPC 2.0');
  }
}
function parseMessage(
  obj: unknown,
  transformer: CombinedDataTransformer,
): TRPCRequest {
  assertIsObject(obj);
  const { method, params, id, jsonrpc } = obj;
  assertIsRequestId(id);
  assertIsJSONRPC2OrUndefined(jsonrpc);
  if (method === 'subscription.stop') {
    return {
      id,
      method,
      params: undefined,
    };
  }
  assertIsProcedureType(method);
  assertIsObject(params);

  const { input: rawInput, path } = params;
  assertIsString(path);
  const input = transformer.input.deserialize(rawInput);
  return { jsonrpc, id, method, params: { input, path } };
}

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> = BaseHandlerOptions<
  TRouter,
  http.IncomingMessage
> & {
  wss: ws.Server;
  process?: NodeJS.Process;
} & NodeHTTPCreateContextOption<TRouter, http.IncomingMessage, ws>;

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { wss, createContext, router } = opts;

  const { transformer } = router._def;
  wss.on('connection', async (client, req) => {
    const clientSubscriptions = new Map<
      number | string,
      Subscription<TRouter>
    >();

    function respond(untransformedJSON: TRPCResponse) {
      client.send(
        JSON.stringify(transformTRPCResponse(router, untransformedJSON)),
      );
    }
    const ctxPromise = createContext?.({ req, res: client });
    let ctx: inferRouterContext<TRouter> | undefined = undefined;

    async function handleRequest(msg: TRPCRequest) {
      const { id } = msg;
      /* istanbul ignore next */
      if (id === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '`id` is required',
        });
      }
      if (msg.method === 'subscription.stop') {
        const sub = clientSubscriptions.get(id);
        if (sub) {
          sub.destroy();
        }
        clientSubscriptions.delete(id);
        return;
      }
      const { path, input } = msg.params;
      const type = msg.method;
      try {
        await ctxPromise; // asserts context has been set
        const result = await callProcedure({
          path,
          input,
          type,
          router,
          ctx,
        });

        if (!(result instanceof Subscription)) {
          respond({
            id,
            result: {
              type: 'data',
              data: result,
            },
          });
          return;
        }

        const sub = result;
        /* istanbul ignore next */
        if (client.readyState !== client.OPEN) {
          // if the client got disconnected whilst initializing the subscription
          sub.destroy();
          return;
        }
        /* istanbul ignore next */
        if (clientSubscriptions.has(id)) {
          // duplicate request ids for client
          sub.destroy();
          throw new TRPCError({
            message: `Duplicate id ${id}`,
            code: 'BAD_REQUEST',
          });
        }
        clientSubscriptions.set(id, sub);
        sub.on('data', (data: unknown) => {
          respond({
            id,
            result: {
              type: 'data',
              data,
            },
          });
        });
        sub.on('error', (_error: unknown) => {
          const error = getErrorFromUnknown(_error);
          const json: TRPCErrorResponse = {
            id,
            error: router.getErrorShape({
              error,
              type,
              path,
              input,
              ctx,
            }),
          };
          opts.onError?.({ error, path, type, ctx, req, input });
          respond(json);
        });
        sub.on('destroy', () => {
          respond({
            id,
            result: {
              type: 'stopped',
            },
          });
        });

        respond({
          id,
          result: {
            type: 'started',
          },
        });
        await sub.start();
      } catch (cause) /* istanbul ignore next */ {
        // procedure threw an error
        const error = getErrorFromUnknown(cause);
        const json = router.getErrorShape({
          error,
          type,
          path,
          input,
          ctx,
        });
        opts.onError?.({ error, path, type, ctx, req, input });
        respond({ id, error: json });
      }
    }
    client.on('message', async (message) => {
      try {
        const msgJSON: unknown = JSON.parse(message.toString());
        const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
        const promises = msgs
          .map((raw) => parseMessage(raw, transformer))
          .map(handleRequest);
        await Promise.all(promises);
      } catch (cause) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          cause,
        });

        respond({
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
    });

    client.once('close', () => {
      for (const sub of clientSubscriptions.values()) {
        sub.destroy();
      }
      clientSubscriptions.clear();
    });
    async function createContextAsync() {
      try {
        ctx = await ctxPromise;
      } catch (cause) {
        const error = getErrorFromUnknown(cause);
        const json: TRPCErrorResponse = {
          id: null,
          error: router.getErrorShape({
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx,
          }),
        };
        opts.onError?.({
          error,
          path: undefined,
          type: 'unknown',
          ctx,
          req,
          input: undefined,
        });
        respond(json);

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
