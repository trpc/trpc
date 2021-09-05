/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as express from 'express';
import { AnyRouter } from '../router';
import { nodeHTTPRequestHandler } from './node-http';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';

export type CreateExpressContextOptions = NodeHTTPCreateContextFnOptions<
  express.Request,
  express.Response
>;

export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, express.Request, express.Response>,
): express.Handler {
  return (req, res) => {
    const endpoint = req.path.substr(1);

    nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path: endpoint,
    });
  };
}
