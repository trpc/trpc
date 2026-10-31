import type http from 'http';
import { initTRPC, type AnyTRPCRouter } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createNextApiHandler } from '@trpc/server/adapters/next';
import {
  nodeHTTPRequestHandler,
  type NodeHTTPHandlerOptions,
} from '@trpc/server/adapters/node-http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

/**
 * Mirrors a third-party adapter (or `createExpressMiddleware`) that forwards
 * its generic handler options to `nodeHTTPRequestHandler`. This must
 * typecheck without casting `opts`.
 */
function createCustomAdapter<TRouter extends AnyTRPCRouter>(
  opts: NodeHTTPHandlerOptions<
    TRouter,
    http.IncomingMessage,
    http.ServerResponse
  >,
) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    await nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path: '',
    });
  };
}

function createCustomAdapterWithExtraOptions<TRouter extends AnyTRPCRouter>(
  opts: NodeHTTPHandlerOptions<
    TRouter,
    http.IncomingMessage,
    http.ServerResponse
  > & {
    prefix?: string;
  },
) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    await nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path: opts.prefix ?? '',
    });
  };
}

function createEmptyContextRouter() {
  const t = initTRPC.create();
  return t.router({
    hello: t.procedure.query(() => 'world'),
  });
}

function createRequiredContextRouter() {
  const t = initTRPC.context<{ userId: string }>().create();
  return t.router({
    hello: t.procedure.query((opts) => opts.ctx.userId),
  });
}

test('generic handler options can be forwarded to nodeHTTPRequestHandler', () => {
  const router = createEmptyContextRouter();

  const handler = createCustomAdapter({ router });
  const handlerWithExtraOptions = createCustomAdapterWithExtraOptions({
    router,
    prefix: 'trpc',
  });

  expectTypeOf(handler).toBeFunction();
  expectTypeOf(handlerWithExtraOptions).toBeFunction();
});

test('createContext is optional when the router context is empty', () => {
  const router = createEmptyContextRouter();

  createCustomAdapter({ router });
  createCustomAdapterWithExtraOptions({ router });
  createHTTPHandler({ router });
  createExpressMiddleware({ router });
  createNextApiHandler({ router });
});

test('createContext is required when the router context has required fields', () => {
  const router = createRequiredContextRouter();
  const createContext = () => ({ userId: 'id' });

  // @ts-expect-error createContext is required
  createCustomAdapter({ router });
  // @ts-expect-error createContext is required
  createCustomAdapterWithExtraOptions({ router });
  // @ts-expect-error createContext is required
  createHTTPHandler({ router });
  // @ts-expect-error createContext is required
  createExpressMiddleware({ router });
  // @ts-expect-error createContext is required
  createNextApiHandler({ router });

  createCustomAdapter({ router, createContext });
  createCustomAdapterWithExtraOptions({ router, createContext });
  createHTTPHandler({ router, createContext });
  createExpressMiddleware({ router, createContext });
  createNextApiHandler({ router, createContext });

  createCustomAdapter({
    router,
    // @ts-expect-error createContext must return the router context
    createContext: () => ({ userId: 1 }),
  });
});
