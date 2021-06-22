import http from 'http';
import ws from 'ws';
import { getErrorFromUnknown, TRPCError } from '../errors';
import { BaseOptions, CreateContextFn } from '../http';
import { callProcedure } from '../internals/callProcedure';
import { AnyRouter, ProcedureType } from '../router';
import {
  TRPCErrorResponse,
  TRPCReconnectNotification,
  TRPCRequest,
  TRPCResponse,
} from '../rpc';
import { Subscription } from '../subscription';
import { DataTransformer } from '../transformer';
// https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
const WEBSOCKET_STATUS_CODES = {
  ABNORMAL_CLOSURE: 1006,
};

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
function parseMessage(obj: unknown, transformer: DataTransformer): TRPCRequest {
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
  const input = transformer.deserialize(rawInput);
  return { jsonrpc, id, method, params: { input, path } };
}

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  wss: ws.Server;
  createContext: CreateContextFn<TRouter, http.IncomingMessage, ws>;
  process?: NodeJS.Process;
} & BaseOptions<TRouter, http.IncomingMessage>;

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

    function respond(json: TRPCResponse) {
      client.send(JSON.stringify(json));
    }
    try {
      const ctx = await createContext({ req, res: client });

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
            respond({
              id,
              result: {
                type: 'stopped',
              },
            });
          }
          return;
        }
        const { path, input } = msg.params;
        const type = msg.method;
        try {
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
                data: transformer.serialize(result),
              },
            });
            return;
          }

          respond({
            id,
            result: {
              type: 'started',
            },
          });
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
            throw new Error(`Duplicate id ${id}`);
          }
          clientSubscriptions.set(id, sub);
          sub.on('data', (data: unknown) => {
            respond({
              id,
              result: {
                type: 'data',
                data: transformer.serialize(data),
              },
            });
          });
          sub.on('error', (_error: unknown) => {
            const error = getErrorFromUnknown(_error);
            const json: TRPCErrorResponse = {
              id,
              error: transformer.serialize(
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
          respond({ id, error: transformer.serialize(json) });
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
            error: transformer.serialize(
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
    } catch (err) /* istanbul ignore next */ {
      // failed to create context
      const error = getErrorFromUnknown(err);

      client.send({
        id: -1,
        error: router.getErrorShape({
          error,
          type: 'unknown',
          path: undefined,
          input: undefined,
          ctx: undefined,
        }),
      });
      opts.onError?.({
        error,
        path: undefined,
        type: 'unknown',
        ctx: undefined,
        req,
        input: undefined,
      });
      client.close(WEBSOCKET_STATUS_CODES.ABNORMAL_CLOSURE);
    }
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
