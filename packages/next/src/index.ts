/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as Next from 'next';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  getErrorResponseEnvelope,
  requestHandler,
  Router,
} from '@trpc/server';

export type CreateNextContextOptions = CreateContextFnOptions<
  Next.NextApiRequest,
  Next.NextApiResponse
>;

export type CreateNextContextFn<TContext> = CreateContextFn<
  TContext,
  Next.NextApiRequest,
  Next.NextApiResponse
>;
export function createNextApiHandler<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>(
  opts: {
    router: TRouter;
    createContext: CreateNextContextFn<TContext>;
  } & BaseOptions,
): Next.NextApiHandler {
  return async (req, res) => {
    const endpoint = Array.isArray(req.query.trpc)
      ? req.query.trpc.join('/')
      : null;

    if (endpoint === null) {
      const json = getErrorResponseEnvelope(
        new Error('Query "trpc" not found - is the file named [...trpc].ts?'),
      );
      res.status(json.statusCode).json(json);
      return;
    }

    await requestHandler({
      ...opts,
      req,
      res,
      path: endpoint,
    });
  };
}
