import type * as express from 'express';
import { BaseOptions, CreateContextFnOptions, requestHandler } from '../http';
import type { Router } from '../router';

export type CreateExpressContextOptions = CreateContextFnOptions<
  express.Request,
  express.Response
>;

export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions,
) => Promise<TContext> | TContext;

export function createExpressMiddleware<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>(
  opts: {
    router: TRouter;
    createContext: CreateExpressContextFn<TContext>;
  } & BaseOptions,
): express.Handler {
  return (req, res) => {
    const endpoint = req.path.substr(1);

    requestHandler({
      ...opts,
      req,
      res,
      endpoint,
    });
  };
}
