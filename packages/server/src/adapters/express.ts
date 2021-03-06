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

export type CreateExpressContextFn<TRouter extends AnyRouter> = CreateContextFn<
  TRouter,
  express.Request,
  express.Response
>;

export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: {
    router: TRouter;
    createContext: CreateExpressContextFn<TRouter>;
  } & BaseOptions<TRouter, express.Request>,
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
