import type http from 'http';
import { initTRPC, type AnyTRPCRouter } from '@trpc/server';
import {
  nodeHTTPRequestHandler,
  type NodeHTTPHandlerOptions,
} from '@trpc/server/adapters/node-http';

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

test('generic handler options can be forwarded to nodeHTTPRequestHandler', () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = createCustomAdapter({ router });

  expectTypeOf(handler).toBeFunction();
});
