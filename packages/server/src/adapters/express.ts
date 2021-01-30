/* eslint-disable @typescript-eslint/no-explicit-any */
import * as express from 'express';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  requestHandler,
} from '../http';
import { Router } from '../router';

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
