import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import {
  BaseOptions,
  CreateContextFnOptions,
  getErrorResponseEnvelope,
  requestHandler,
} from './http';
import type { Router } from './router';

export type CreateNextContextOptions = CreateContextFnOptions<
  NextApiRequest,
  NextApiResponse
>;

export type CreateNextContextFn<TContext> = (
  opts: CreateNextContextOptions
) => Promise<TContext> | TContext;

export function createNextApiHandler<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>(
  opts: {
    router: TRouter;
    createContext: CreateNextContextFn<TContext>;
  } & BaseOptions
): NextApiHandler {
  return async (req, res) => {
    const endpoint = Array.isArray(req.query.trpc)
      ? req.query.trpc.join('/')
      : null;

    if (endpoint === null) {
      const json = getErrorResponseEnvelope(
        new Error('Query "trpc" not found - is the file named [...trpc].ts?')
      );
      res.status(json.statusCode).json(json);
      return;
    }

    requestHandler({
      ...opts,
      req,
      res,
      endpoint,
    });
  };
}
