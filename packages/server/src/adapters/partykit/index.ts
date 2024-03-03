import type * as Party from 'partykit/server';
import {
  callTRPCProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  TRPCError,
  type AnyRouter,
  type inferRouterContext,
} from '../../@trpc/server';
import {
  parseTRPCMessage,
  type TRPCResponseMessage,
} from '../../@trpc/server/rpc';
import { isObservable, type Unsubscribable } from '../../observable';
// eslint-disable-next-line no-restricted-imports
import type {
  JSONRPC2,
  MaybePromise,
  OnErrorFunction,
  TRPCClientOutgoingMessage,
} from '../../unstable-core-do-not-import';
import type { FetchCreateContextOption } from '../fetch';
import { fetchRequestHandler } from '../fetch';

/**
 * Importing ws causes a build error
 * @link https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

export type tRPCPartyServer<TRouter extends AnyRouter> = {
  router?: TRouter;
  respond?: (
    connection: Party.Connection,
  ) => (untransformedJSON: TRPCResponseMessage) => void;
  handleRequest(msg: TRPCClientOutgoingMessage): Promise<void>;
  tRPCContext?: inferRouterContext<TRouter>;
} & Party.Server;

type CreateContext<TRouter extends AnyRouter> =
  object extends inferRouterContext<TRouter>
    ? {
        /**
         * @link https://trpc.io/docs/v11/context
         **/
        createContext?: (
          connection: Party.Connection,
          ctx: Party.ConnectionContext,
        ) => MaybePromise<inferRouterContext<TRouter>>;
      }
    : {
        /**
         * @link https://trpc.io/docs/v11/context
         **/
        createContext: (
          connection: Party.Connection,
          ctx: Party.ConnectionContext,
        ) => MaybePromise<inferRouterContext<TRouter>>;
      };

export function applyParty<TRouter extends AnyRouter>({
  instance,
  router,
  prefix,
  createContext,
  createWssContext,
  onError,
}: {
  instance: tRPCPartyServer<TRouter>;
  router: TRouter;
  prefix: string;
  onError?: OnErrorFunction<TRouter, Party.ConnectionContext['request'] | null>;
} & FetchCreateContextOption<TRouter> & {
    createWssContext: CreateContext<TRouter>['createContext'];
  }) {
  const clientSubscriptions = new Map<number | string, Unsubscribable>();
  const { transformer } = router._def._config;
  instance.router = router;

  // Request
  const _onRequest = instance.onRequest?.bind(instance);
  instance.onRequest = async (req: Party.Request) => {
    if (prefix && !req.url?.startsWith(prefix)) {
      if (_onRequest) {
        return await _onRequest(req);
      }
      return new Response(null, { status: 404 });
    }

    // @ts-expect-error req type mismatch
    return fetchRequestHandler({
      endpoint: prefix,
      req,
      resHeaders: new Headers(),
      router,
      createContext,
    });
  };

  // Connection
  const _onConnect = instance.onConnect?.bind(instance);
  instance.onConnect = async (
    connection: Party.Connection,
    ctx: Party.ConnectionContext,
  ) => {
    if (prefix && !connection.url?.startsWith(prefix)) {
      if (_onConnect) {
        await _onConnect(connection, ctx);
      }
      return;
    }

    const ctxPromise = createWssContext?.(connection, ctx);
    instance.tRPCContext = undefined;

    instance.respond =
      (connection: Party.Connection) =>
      (untransformedJSON: TRPCResponseMessage) => {
        connection.send(
          JSON.stringify(
            transformTRPCResponse(router._def._config, untransformedJSON),
          ),
        );
      };

    instance.handleRequest = handleRequest;

    function stopSubscription(
      subscription: Unsubscribable,
      { id, jsonrpc }: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId },
    ) {
      subscription.unsubscribe();

      instance.respond?.(connection)({
        id,
        jsonrpc,
        result: {
          type: 'stopped',
        },
      });
    }
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

        const result = await callTRPCProcedure({
          procedures: router._def.procedures,
          path,
          getRawInput: async () => input,
          ctx: instance.tRPCContext,
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
          instance.respond?.(connection)({
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
            instance.respond?.(connection)({
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
            onError?.({
              error,
              path,
              type,
              ctx: instance.tRPCContext,
              req: ctx.request,
              input,
            });
            instance.respond?.(connection)({
              id,
              jsonrpc,
              error: getErrorShape({
                config: router._def._config,
                error,
                type,
                path,
                input,
                ctx: instance.tRPCContext,
              }),
            });
          },
          complete() {
            instance.respond?.(connection)({
              id,
              jsonrpc,
              result: {
                type: 'stopped',
              },
            });
          },
        });
        /* istanbul ignore next -- @preserve */
        if (connection.readyState !== WEBSOCKET_OPEN) {
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

        instance.respond?.(connection)({
          id,
          jsonrpc,
          result: {
            type: 'started',
          },
        });
      } catch (cause) /* istanbul ignore next -- @preserve */ {
        // procedure threw an error
        const error = getTRPCErrorFromUnknown(cause);
        onError?.({
          error,
          path,
          type,
          ctx: instance.tRPCContext,
          req: ctx.request,
          input,
        });
        instance.respond?.(connection)({
          id,
          jsonrpc,
          error: getErrorShape({
            config: router._def._config,
            error,
            type,
            path,
            input,
            ctx: instance.tRPCContext,
          }),
        });
      }
    }

    async function createContextAsync() {
      try {
        instance.tRPCContext = await ctxPromise;
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        onError?.({
          error,
          path: undefined,
          type: 'unknown',
          ctx: instance.tRPCContext,
          req: ctx.request,
          input: undefined,
        });
        instance.respond?.(connection)({
          id: null,
          error: getErrorShape({
            config: router._def._config,
            error,
            type: 'unknown',
            path: undefined,
            input: undefined,
            ctx: instance.tRPCContext,
          }),
        });

        // close in next tick
        (global.setImmediate ?? global.setTimeout)(() => {
          connection.close();
        });
      }
    }
    await createContextAsync();
  };

  // Error
  const _onError = instance.onError?.bind(instance);
  instance.onError = async (connection: Party.Connection, error: Error) => {
    await _onError?.(connection, error);
    onError?.({
      ctx: instance.tRPCContext,
      error: getTRPCErrorFromUnknown(error),
      input: undefined,
      path: undefined,
      type: 'unknown',
      req: null,
    });
  };

  // Close
  const _onClose = instance.onClose?.bind(instance);
  instance.onClose = async (connection: Party.Connection) => {
    if (prefix && !connection.url?.startsWith(prefix)) {
      if (_onClose) {
        await _onClose(connection);
      }
      return;
    }

    for (const sub of clientSubscriptions.values()) {
      sub.unsubscribe();
    }
    clientSubscriptions.clear();
  };
  // Messages
  const _onMessage = instance.onMessage?.bind(instance);
  instance.onMessage = async (
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Party.Connection,
  ) => {
    if (prefix && !sender.url?.startsWith(prefix)) {
      if (_onMessage) {
        await _onMessage(message, sender);
      }
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const msgJSON: unknown = JSON.parse(message.toString());
      const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
      const promises = msgs
        .map((raw) => parseTRPCMessage(raw, transformer))
        .map(instance.handleRequest.bind(instance));
      await Promise.all(promises);
    } catch (cause) {
      const error = new TRPCError({
        code: 'PARSE_ERROR',
        cause,
      });

      instance.respond?.(sender)({
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
  };
}
