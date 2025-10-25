import {
  __getSpy,
  trpcServerResource,
  type TRPCServerResourceOpts,
} from '@trpc/server/__tests__/trpcServerResource';
import { httpBatchLink, httpLink, httpSubscriptionLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { tap } from '@trpc/server/observable';
import type { inferClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import { WebSocket } from 'ws';
import type {
  CreateTRPCClientOptions,
  Operation,
  OperationResultEnvelope,
  TRPCClientError,
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from '..';
import {
  createTRPCClient,
  createWSClient,
  httpBatchStreamLink,
  splitLink,
  wsLink,
} from '..';
import type { TransformerOptions } from '../unstable-internals';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
globalThis.WebSocket = WebSocket as any;

export type CreateClientCallback<TRouter extends AnyTRPCRouter> = (opts: {
  httpUrl: string;
  wssUrl: string;
  wsClient: TRPCWebSocketClient;
  transformer: TransformerOptions<inferClientTypes<TRouter>>['transformer'];
}) => Partial<CreateTRPCClientOptions<TRouter>>;

export interface TestServerAndClientResourceOpts<TRouter extends AnyTRPCRouter>
  extends TRPCServerResourceOpts<TRouter> {
  /**
   * Defaults to being lazy
   */
  wsClient?: Partial<WebSocketClientOptions>;
  client?:
    | Partial<CreateTRPCClientOptions<TRouter>>
    | CreateClientCallback<TRouter>;
  /**
   * Use a specific link for the client
   */
  clientLink?:
    | 'httpBatchLink'
    | 'httpBatchStreamLink'
    | 'httpLink'
    | 'httpSubscriptionLink'
    | 'wsLink';
}

export function testServerAndClientResource<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  opts?: TestServerAndClientResourceOpts<TRouter>,
) {
  const serverResource = trpcServerResource(router, opts);

  const linkSpy = {
    up: __getSpy<(op: Operation<unknown>) => void>(),
    next: __getSpy<
      (
        result: OperationResultEnvelope<unknown, TRPCClientError<TRouter>>,
      ) => void
    >(),
    error: __getSpy<(result: TRPCClientError<TRouter>) => void>(),
    complete: __getSpy<() => void>(),
  };

  // client
  const wsClient = createWSClient({
    url: serverResource.wssUrl,
    lazy: {
      enabled: true,
      closeMs: 0,
    },
    ...opts?.wsClient,
  });

  const transformer = router._def._config.transformer as any;

  const links = {
    httpLink: httpLink({
      url: serverResource.httpUrl,
      transformer,
    }),
    httpBatchLink: httpBatchLink({
      url: serverResource.httpUrl,
      transformer,
    }),
    httpSubscriptionLink: httpSubscriptionLink({
      url: serverResource.httpUrl,
      transformer,
    }),
    wsLink: wsLink({
      client: wsClient,
      transformer,
    }),
    httpBatchStreamLink: httpBatchStreamLink({
      url: serverResource.httpUrl,
      transformer,
    }),
  };
  const trpcClientOptions = {
    links: [
      () => {
        // here we just got initialized in the app - this happens once per app
        // useful for storing cache for instance
        return (opts) => {
          // this is when passing the result to the next link

          linkSpy.up(opts.op);
          return opts.next(opts.op).pipe(
            tap({
              next(result) {
                linkSpy.next(result);
              },
              error(error) {
                linkSpy.error(error);
              },
              complete() {
                linkSpy.complete();
              },
            }),
          );
        };
      },
      opts?.clientLink
        ? links[opts.clientLink]
        : splitLink({
            condition: (op) => op.context?.['ws'] === true,
            true: links.wsLink,
            false: splitLink({
              condition: (op) => op.type === 'subscription',
              true: links.httpSubscriptionLink,

              false: splitLink({
                condition: (op) => op.context['batch'] === false,
                true: links.httpLink,

                // This is the fallback / default link
                false: splitLink({
                  condition: (op) => op.context['stream'] === false,
                  true: links.httpBatchLink,

                  // This is the fallback / default link
                  false: links.httpBatchStreamLink,
                }),
              }),
            }),
          }),
    ],
    ...(opts?.client
      ? typeof opts.client === 'function'
        ? opts.client({
            httpUrl: serverResource.httpUrl,
            wssUrl: serverResource.wssUrl,
            wsClient,
            transformer: router._def._config.transformer as any,
          })
        : opts.client
      : {}),
  } satisfies CreateTRPCClientOptions<typeof router>;

  const client = createTRPCClient<typeof router>(trpcClientOptions);

  const ctx = {
    ...serverResource,
    wsClient,
    client,
    trpcClientOptions,
    linkSpy,
  };
  return ctx;
}
