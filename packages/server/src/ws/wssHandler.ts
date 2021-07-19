import http from 'http';
import ws from 'ws';
import { getErrorFromUnknown } from '../internals/errors';
import { TRPCError } from '../TRPCError';
import { CreateContextFn } from '../http';
import { BaseHandlerOptions } from '../internals/BaseHandlerOptions';
import { callProcedure } from '../internals/callProcedure';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import {
  TRPCErrorResponse,
  TRPCReconnectNotification,
  TRPCRequest,
  TRPCResponse,
} from '../rpc';
import { Subscription } from '../subscription';
import { CombinedDataTransformer } from '../transformer';

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
export type WSSHandlerOptions<TRouter extends AnyRouter> = {
  wss: ws.Server;
  createContext: CreateContextFn<TRouter, http.IncomingMessage, ws>;
  process?: NodeJS.Process;
} & BaseHandlerOptions<TRouter, http.IncomingMessage>;

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const { wss, createContext, router } = opts;

  const { transformer } = router._def;
  wss.on('connection', (client, req) => {
    const clientSubscriptions = new Map<
      number | string,
      Subscription<TRouter>
    >();

    function respond(json: TRPCResponse) {
      client.send(JSON.stringify(json));
    }
    const ctxPromise = createContext({ req, res: client });
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
        clientSubscriptions.delete(id);
        if (sub) {
          sub.destroy();
        }
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
              data: transformer.output.serialize(result),
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
              data: transformer.output.serialize(data),
            },
          });
        });
        sub.on('error', (_error: unknown) => {
          const error = getErrorFromUnknown(_error);
          const json: TRPCErrorResponse = {
            id,
            error: transformer.output.serialize(
              router.getErrorShape({
                error,
                type,
                path,
                input,
                ctx,
              }),
            ),
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
      } catch (_error) /* istanbul ignore next */ {
        // procedure threw an error
        const error = getErrorFromUnknown(_error);
        const json = router.getErrorShape({
          error: _error,
          type,
          path,
          input,
          ctx,
        });
        opts.onError?.({ error, path, type, ctx, req, input });
        respond({ id, error: transformer.output.serialize(json) });
      }
    }
    client.on('message', async (message) => {
      const msgJSON: unknown = JSON.parse(message as string);
      const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
      try {
        msgs.map((raw) => parseMessage(raw, transformer)).map(handleRequest);
      } catch (originalError) {
        const error = new TRPCError({
          code: 'PARSE_ERROR',
          originalError,
        });

        respond({
          id: null,
          error: transformer.output.serialize(
            router.getErrorShape({
              error,
              type: 'unknown',
              path: undefined,
              input: undefined,
              ctx: undefined,
            }),
          ),
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
      } catch (err) {
        const error = getErrorFromUnknown(err);
        const json: TRPCErrorResponse = {
          id: null,
          error: transformer.output.serialize(
            router.getErrorShape({
              error,
              type: 'unknown',
              path: undefined,
              input: undefined,
              ctx,
            }),
          ),
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
    createContextAsync();
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
