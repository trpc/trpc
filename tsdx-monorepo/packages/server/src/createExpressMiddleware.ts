import type * as express from 'express';
import { assertNotBrowser } from './assertNotBrowser';
import { requestHandler } from './http';
import { Router } from './router';

assertNotBrowser();

export type CreateExpressContextOptions = {
  req: express.Request;
  res: express.Response;
};
export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions
) => Promise<TContext> | TContext;

export function createExpressMiddleware<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>({
  router,
  createContext,
  subscriptions,
}: {
  router: TRouter;
  createContext: CreateExpressContextFn<TContext>;
  subscriptions?: {
    timeout?: number;
  };
}): express.Handler {
  return async (req, res) => {
    const endpoint = req.path.substr(1);
    const ctx = await createContext({ req, res });

    requestHandler({
      req,
      res,
      ctx,
      router,
      subscriptions,
      endpoint,
    });
  };
}
