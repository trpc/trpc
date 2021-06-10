import http from 'http';
import WebSocket from 'ws';
import {
  TRPCProcedureEnvelope,
  TRPCProcedureErrorEnvelope,
} from '../envelopes';
import { getErrorFromUnknown } from '../errors';
import { BaseOptions, CreateContextFn } from '../http';
import { getCombinedDataTransformer } from '../internals/getCombinedDataTransformer';
import { AnyRouter, ProcedureType } from '../router';
import { Subscription } from '../subscription';
import { CombinedDataTransformer } from '../transformer';
const wss = new WebSocket.Server({ port: 8080 });

// https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
const WEBSOCKET_STATUS_CODES = {
  ABNORMAL_CLOSURE: 1006,
};

// json rpc 2 reference
// --> {"jsonrpc": "2.0", "method": "subtract", "params": [42, 23], "id": 1}
// <-- {"jsonrpc": "2.0", "result": 19, "id": 1}
// --> {"jsonrpc": "2.0", "method": "call", "params": [{type: x, 23]], "id": 1}

function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
  const type = typeof obj;
  if (type === 'function' || (type === 'object' && !!obj)) {
    throw new Error('Not an object');
  }
}
function assertIsProcedureType(obj: unknown): asserts obj is ProcedureType {
  if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
    throw new Error('Invalid procedure type');
  }
}
function assertIsRequestId(obj: unknown): asserts obj is number {
  if (typeof obj !== 'number' || isNaN(obj)) {
    throw new Error('Invalid requestId');
  }
}
function assertIsString(obj: unknown): asserts obj is string {
  if (typeof obj !== 'string') {
    throw new Error('Invalid string');
  }
}
function parseMessage({
  message,
  transformer,
}: {
  message: unknown;
  transformer: CombinedDataTransformer;
}) {
  assertIsString(message);
  const obj = transformer.input.deserialize(JSON.parse(message));
  assertIsObject(obj);
  const { method, params, id } = obj;
  assertIsProcedureType(method);
  assertIsObject(params);
  assertIsRequestId(id);

  const { input, path } = params;
  assertIsString(path);

  return { type: method, id, input, path };
}

async function callProcedure<TRouter extends AnyRouter>(opts: {
  path: string;
  input: unknown;
  caller: ReturnType<TRouter['createCaller']>;
  type: ProcedureType;
}): Promise<unknown | Subscription<TRouter>> {
  const { type, path, input, caller } = opts;
  if (type === 'query') {
    return caller.query(path, input);
  }
  if (type === 'mutation') {
    return caller.mutation(path, input);
  }
  if (type === 'subscription') {
    const sub = (await caller.subscription(path, input)) as Subscription;
    return sub;
  }

  throw new Error(`Unknown procedure type ${type}`);
}

export type WebSocketHandlerOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  wss: WebSocket.Server;
  createContext: CreateContextFn<TRouter, http.IncomingMessage, WebSocket>;
} & BaseOptions<TRouter, http.IncomingMessage>;

export function webSocketHandler<TRouter extends AnyRouter>(
  opts: WebSocketHandlerOptions<TRouter>,
) {
  const { router, wss, createContext } = opts;
  const transformer = getCombinedDataTransformer(opts.transformer);
  wss.on('connection', async (ws, req) => {
    const subscriptions = new Map<number, Subscription<TRouter>>();

    try {
      const ctx = await createContext({ req, res: ws });
      const caller = router.createCaller(ctx);
      ws.on('message', async (message) => {
        ws.on('close', () => {
          for (const sub of subscriptions.values()) {
            sub.destroy();
          }
          subscriptions.clear();
        });
        function send(json: TRPCProcedureEnvelope<TRouter, unknown>) {
          ws.emit(JSON.stringify(transformer.output.serialize(json)));
        }
        try {
          const info = parseMessage({ message, transformer });
          const { path, input, type, id } = info;

          const result = await callProcedure({ path, input, type, caller });
          if (result instanceof Subscription) {
            if (ws.CLOSED) {
              result.destroy();
              return;
            }
            if (subscriptions.has(id)) {
              result.destroy();
              throw new Error(`Duplicate id ${id}`);
            }
            result.on('data', (data: unknown) => {
              send({
                ok: true,
                data,
              });
            });
            // FIXME handle errors? or not? maybe push it to a callback with the ws client
            return;
          }
          send({
            ok: true,
            data: result,
          });
        } catch (error) {
          const json: TRPCProcedureErrorEnvelope<TRouter> = {
            ok: false,
            error: router.getErrorShape({
              error,
              type: 'unknown',
              path: undefined,
              input: undefined,
              ctx,
            }),
          };
          ws.send(json);
        }
      });
    } catch (err) {
      const error = getErrorFromUnknown(err);

      const json: TRPCProcedureErrorEnvelope<TRouter> = {
        ok: false,
        error: router.getErrorShape({
          error,
          type: 'unknown',
          path: undefined,
          input: undefined,
          ctx: undefined,
        }),
      };
      ws.send(json);
      ws.close(WEBSOCKET_STATUS_CODES.ABNORMAL_CLOSURE);
    }
  });
}
