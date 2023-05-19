import type {
  NextApiHandler,
  NextApiRequest,
  NextApiResponse,
} from 'next/types';
import { AnyRouter } from '../core';
import { TRPCError } from '../error/TRPCError';
import { getErrorShape } from '../shared/getErrorShape';
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
      const error = getErrorShape({
        config: opts.router._def._config,
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
      res.statusCode = 500;
      res.json({
        id: -1,
        error,
      });
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
