/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  getErrorResponseEnvelope,
  HTTPError,
  requestHandler,
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
  } & BaseOptions<TRouter>,
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
      const json = getErrorResponseEnvelope({
        error: new HTTPError(
          'Query "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
          },
        ),
        path: undefined,
      });
      res.status(json.statusCode).json(json);
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
