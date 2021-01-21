import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { assertNotBrowser } from './assertNotBrowser';
import { CreateExpressContextFn } from './createExpressMiddleware';
import { requestHandler } from './http';
import { Router } from './router';

assertNotBrowser();

export type CreateNextContextOptions = {
  req: NextApiRequest;
  res: NextApiResponse;
};
export type CreateNextContextFn<TContext> = (
  opts: CreateNextContextOptions
) => Promise<TContext> | TContext;

export function createNextApiFunction<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>({
  router,
  createContext,
  subscriptions,
  path,
}: {
  router: TRouter;
  createContext?: CreateExpressContextFn<TContext>;
  subscriptions?: {
    timeout?: number;
  };
  path: string;
}): NextApiHandler {
  return async (req, res) => {
    try {
      const endpoint = path.substr(1);
      const ctx = createContext
        ? await createContext({ req: req as any, res: res as any })
        : null;

      await requestHandler({
        req,
        res,
        ctx,
        router,
        subscriptions,
        endpoint,
      });
    } catch (err) {
      // todo
      throw err;
    }
  };
}
