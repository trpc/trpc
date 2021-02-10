/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  getErrorResponseEnvelope,
  requestHandler,
} from '../http';
import { Router } from '../router';

export type CreateNextContextOptions = CreateContextFnOptions<
  NextApiRequest,
  NextApiResponse
>;

export type CreateNextContextFn<TContext> = CreateContextFn<
  TContext,
  NextApiRequest,
  NextApiResponse
>;
export function createNextApiHandler<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>(
  opts: {
    router: TRouter;
    createContext: CreateNextContextFn<TContext>;
  } & BaseOptions,
): NextApiHandler {
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
