/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as express from 'express';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  requestHandler,
} from '../http';
import { AnyRouter } from '../router';

export type CreateExpressContextOptions = CreateContextFnOptions<
  express.Request,
  express.Response
>;

export type CreateExpressContextFn<TContext> = CreateContextFn<
  TContext,
  express.Request,
  express.Response
>;

export function createExpressMiddleware<
  TContext,
  TRouter extends AnyRouter<TContext>
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
      path: endpoint,
    });
  };
}
