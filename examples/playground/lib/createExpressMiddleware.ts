import express from 'express';
import { HTTPErrorResponse, HTTPSuccessResponse, notFoundError } from './http';
import { Router } from './router';

export type HTTPResponseEnvelope<TData> =
  | {
      ok: true;
      statusCode: number;
      data: TData;
    }
  | {
      ok: false;
      statusCode: number;
      error: {
        message: string;
        stack?: string | undefined;
      };
    };

export type CreateExpressContextOptions = {
  req: express.Request;
  res: express.Response;
};
export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions,
) => Promise<TContext> | TContext;

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
        throw notFoundError(`No endpoint "${endpoint}"`);
      }
      let args = req.body?.args ?? JSON.parse(req.query.args as string) ?? [];

      const ctx = await createContext({ req, res });
      console.log('⬅️ ', req.method, endpoint, {
        args,
        auth: req.headers.authorization,
      });
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
        process.env.NODE_ENV !== 'production' && typeof err.stack === 'string'
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
