import type * as express from 'express';
import type { AnyRouter } from '../core';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { nodeHTTPRequestHandler } from './node-http';

export type CreateExpressContextOptions = NodeHTTPCreateContextFnOptions<
  express.Request,
  express.Response
>;

export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, express.Request, express.Response>,
): express.Handler {
  return async (req, res) => {
    const endpoint = req.path.slice(1);

    await nodeHTTPRequestHandler({
      // FIXME: no typecasting should be needed here
      ...(opts as NodeHTTPHandlerOptions<
        AnyRouter,
        express.Request,
        express.Response
      >),
      req,
      res,
      path: endpoint,
    });
  };
}
