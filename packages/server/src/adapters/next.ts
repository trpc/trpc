/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { CreateContextFn, CreateContextFnOptions, requestHandler } from '../';
import { TRPCError } from '../TRPCError';
import { BaseHandlerOptions } from '../internals/BaseHandlerOptions';
import { AnyRouter } from '../router';
import { TRPCErrorResponse } from '../rpc';

export type CreateNextContextOptions = CreateContextFnOptions<
  NextApiRequest,
  NextApiResponse
>;

export type CreateNextContextFn<TRouter extends AnyRouter> = CreateContextFn<
  TRouter,
  NextApiRequest,
  NextApiResponse
>;
export function createNextApiHandler<TRouter extends AnyRouter>(
  opts: {
    createContext: CreateNextContextFn<TRouter>;
  } & BaseHandlerOptions<TRouter, NextApiRequest>,
): NextApiHandler {
  return async (req, res) => {
    function getPath(): string | null {
      if (typeof req.query.trpc === 'string') {
        return req.query.trpc;
      }
      if (Array.isArray(req.query.trpc)) {
        return req.query.trpc.join('/');
      }
      return null;
    }
    const path = getPath();

    if (path === null) {
      const error = opts.router.getErrorShape({
        error: new TRPCError({
          message:
            'Query "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          code: 'INTERNAL_SERVER_ERROR',
        }),
        type: 'unknown',
        ctx: undefined,
        path: undefined,
        input: undefined,
      });
      const json: TRPCErrorResponse = {
        id: -1,
        error,
      };
      res.statusCode = 500;
      res.json(json);
      return;
    }

    await requestHandler({
      ...opts,
      req,
      res,
      path,
    });
  };
}
