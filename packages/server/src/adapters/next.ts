/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import type {
  NextApiHandler,
  NextApiRequest,
  NextApiResponse,
} from 'next/types';
import { TRPCError } from '../TRPCError';
import { AnyRouter } from '../router';
import { TRPCErrorResponse } from '../rpc';
import { nodeHTTPRequestHandler } from './node-http';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';

export type CreateNextContextOptions = NodeHTTPCreateContextFnOptions<
  NextApiRequest,
  NextApiResponse
>;

export function createNextApiHandler<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, NextApiRequest, NextApiResponse>,
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

    await nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path,
    });
  };
}
