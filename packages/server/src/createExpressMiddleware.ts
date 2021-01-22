import type * as express from 'express';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  requestHandler,
} from './http';
import type { Router } from './router';

export type CreateExpressContextOptions = CreateContextFnOptions<
  express.Request,
  express.Response
>;

export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions,
) => Promise<TContext> | TContext;

export function createExpressMiddleware<
  TContext,
  TRouter extends Router<TContext, never, never, never>
>(
  opts: {
    router: TRouter;
    createContext: CreateContextFn<TContext, express.Request, express.Response>;
  } & BaseOptions,
): express.Handler {
  return async (req, res) => {
    const endpoint = req.path.substr(1);

    requestHandler({
      ...opts,
      req,
      res,
      endpoint,
    });
  };
}
