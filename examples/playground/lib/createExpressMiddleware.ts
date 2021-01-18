import express from 'express';
import { assertNotBrowser } from './assertNotBrowser';
import {
  httpError,
  HTTPErrorResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from './http';
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
  let args: unknown[] = [];
  if (req.method === 'POST') {
    args = req.body.args ?? [];
  } else if (req.method === 'GET') {
    try {
      const queryArg = req.query.args as string;
      if (queryArg) {
        args = JSON.parse(queryArg);
      }
    } catch (_err) {
      throw httpError.badRequest('Unable to parse args query paramater');
    }
  } else {
    throw httpError.badRequest(`Unacceptable method "${req.method}"`);
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
  router: Router<TContext, any, any>;
  createContext: CreateExpressContextFn<TContext>;
}): express.Handler {
  return async (req, res) => {
    try {
      const endpoint = req.path.substr(1);
      if (req.method !== 'POST' && req.method !== 'GET') {
        throw httpError.badRequest(`Forbidden method '${req.method}'`);
      }
      if (req.method === 'POST' && !router.hasMutation(endpoint)) {
        throw httpError.badRequest(`No such mutation "${endpoint}"`);
      } else if (req.method === 'GET' && !router.hasQuery(endpoint)) {
        throw httpError.badRequest(`No such query "${endpoint}"`);
      }

      const args = getArgs(req);

      const ctx = await createContext({ req, res });

      let data: unknown;
      if (req.method === 'GET') {
        const handle = router.createQueryHandler(ctx);
        data = await handle(endpoint, ...args);
      } else {
        const handle = router.createMutationHandler(ctx);
        data = await handle(endpoint, ...args);
      }

      const json: HTTPSuccessResponseEnvelope<unknown> = {
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

      const json: HTTPErrorResponseEnvelope = {
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
