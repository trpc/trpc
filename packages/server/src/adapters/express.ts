import type * as express from 'express';
import { AnyRouter } from '../core';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  nodeHTTPRequestHandler,
} from './node-http';

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
      ...opts,
      req,
      res,
      path: endpoint,
    });
  };
}
