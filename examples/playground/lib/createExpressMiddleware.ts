import express from 'express';
import { assertNotBrowser } from './assertNotBrowser';
import { httpError, HTTPErrorResponse, HTTPSuccessResponse } from './http';
import { Router } from './router';

assertNotBrowser();

export type CreateExpressContextOptions = {
  req: express.Request;
  res: express.Response;
};
export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions,
) => Promise<TContext> | TContext;

function getArgs(req: express.Request): unknown[] {
  let args: unknown[];
  if (req.method === 'POST') {
    args = req.body.args;
  } else if (req.method === 'GET') {
    try {
      args = JSON.parse(req.query.args as string);
    } catch (_err) {
      throw httpError.badRequest('Unable to parse args query paramater');
    }
  } else {
    throw httpError.badRequest(`Unacceptable method "${req.method}"`);
  }
  if (args === null || args === undefined) {
    args = [];
  }
  if (!Array.isArray(args)) {
    throw httpError.badRequest('Expected args to be an array');
  }
  return args;
}

export function createExpressMiddleware<TContext>({
  router,
  createContext,
}: {
  router: Router<TContext, any>;
  createContext: CreateExpressContextFn<TContext>;
}): express.Handler {
  return async (req, res) => {
    try {
      const endpoint = req.path.substr(1);
      if (!router.has(endpoint)) {
        throw httpError.badRequest(`No such endpoint "${endpoint}"`);
      }
      let args = getArgs(req);

      const ctx = await createContext({ req, res });
      const handle = router.handler(ctx);

      const data = await handle(endpoint, args);

      const json: HTTPSuccessResponse<unknown> = {
        ok: true,
        statusCode: res.statusCode ?? 200,
        data,
      };
      res.status(json.statusCode).json(json);
    } catch (err) {
      const statusCode: number =
        typeof err?.statusCode === 'number' ? err.statusCode : 500;
      const message: string =
        typeof err?.message === 'string'
          ? err.message
          : 'Internal Server Error';

      const stack: string | undefined =
        process.env.NODE_ENV !== 'production' && typeof err?.stack === 'string'
          ? err.stack
          : undefined;

      const json: HTTPErrorResponse = {
        ok: false,
        statusCode,
        error: {
          message,
          stack,
        },
      };
      res.status(json.statusCode).json(json);
    }
  };
}
