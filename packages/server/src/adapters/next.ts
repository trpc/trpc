/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  HTTPError,
  requestHandler,
  HTTPErrorResponseEnvelope,
} from '../';
import { AnyRouter } from '../router';

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
    router: TRouter;
    createContext: CreateNextContextFn<TRouter>;
  } & BaseOptions<TRouter, NextApiRequest>,
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
        error: new HTTPError(
          'Query "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
          },
        ),
        type: 'unknown',
        ctx: undefined,
        path: undefined,
        input: undefined,
      });
      const json: HTTPErrorResponseEnvelope<TRouter> = {
        ok: false,
        statusCode: 500,
        error,
      };
      res.statusCode = json.statusCode;
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
