/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as express from 'express';
import { CreateContextFnOptions, requestHandler } from '../http';
import { AnyRouter } from '../router';
import { NodeHTTPHandlerOptions } from './node-http/types';

export type CreateExpressContextOptions = CreateContextFnOptions<
  express.Request,
  express.Response
>;

export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, express.Request, express.Response>,
): express.Handler {
  return (req, res) => {
    const endpoint = req.path.substr(1);

    requestHandler({
      ...opts,
      req,
      res,
      path: endpoint,
    });
  };
}
