/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as fastify from 'fastify';
import { BaseOptions, CreateContextFn, CreateContextFnOptions } from '../http';
import { requestHandler } from '../http';
import { AnyRouter } from '../router';
import http from 'http';

export type CreateExpressContextOptions = CreateContextFnOptions<
  fastify.FastifyRequest,
  http.ServerResponse
>;

export type CreateExpressContextFn<TRouter extends AnyRouter> = CreateContextFn<
  TRouter,
  fastify.FastifyRequest,
  http.ServerResponse
>;

export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: {
    router: TRouter;
    createContext: CreateExpressContextFn<TRouter>;
  } & BaseOptions<TRouter, fastify.FastifyRequest>,
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
