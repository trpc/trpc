import { AnyRouter } from '@trpc/core';
import type * as express from 'express';
import { nodeHTTPRequestHandler } from './node-http/nodeHTTPRequestHandler';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http/types';

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
