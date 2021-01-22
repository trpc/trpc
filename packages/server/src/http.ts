/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EventEmitter } from 'events';
import type qs from 'qs';
import { assertNotBrowser } from './assertNotBrowser';
import { Router } from './router';
import { Subscription, SubscriptionDestroyError } from './subscription';
assertNotBrowser();
export class HTTPError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}

export const httpError = {
  forbidden: (message?: string) => new HTTPError(403, message ?? 'Forbidden'),
  unauthorized: (message?: string) =>
    new HTTPError(401, message ?? 'Unauthorized'),
  badRequest: (message?: string) =>
    new HTTPError(400, message ?? 'Bad Request'),
  notFound: (message?: string) => new HTTPError(404, message ?? 'Not found'),
};
export type HTTPSuccessResponseEnvelope<TData> = {
  ok: true;
  statusCode: number;
  data: TData;
};

export type HTTPErrorResponseEnvelope = {
  ok: false;
  statusCode: number;
  error: {
    message: string;
    stack?: string | undefined;
  };
};

export type HTTPResponseEnvelope<TData> =
  | HTTPSuccessResponseEnvelope<TData>
  | HTTPErrorResponseEnvelope;

export function getErrorResponseEnvelope(err?: Partial<HTTPError>) {
  const statusCode: number =
    typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const message: string =
    typeof err?.message === 'string' ? err.message : 'Internal Server Error';

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

  return json;
}

export function getQueryArgs<TRequest extends BaseRequest>(req: TRequest) {
  let args: unknown[] = [];

  const queryArgs = req.query.args;
  if (!queryArgs) {
    return args;
  }
  if (typeof queryArgs !== 'string') {
    throw httpError.badRequest('Expected query.args to be a JSON string');
  }
  try {
    args = JSON.parse(queryArgs);
  } catch (err) {
    throw httpError.badRequest('Expected query.args to be a JSON string');
  }

  if (!Array.isArray(args)) {
    throw httpError.badRequest(
      'Expected query.args to be parsed as an JSON-array',
    );
  }
  return args;
}

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TContext, TRequest, TResponse> = (opts: {
  req: TRequest;
  res: TResponse;
}) => TContext | Promise<TContext>;

interface BaseRequest {
  method?: string;
  query: qs.ParsedQs;
  body?: any;
}
interface BaseResponse extends EventEmitter {
  status: (code: number) => BaseResponse;
  json: (data: unknown) => any;
  statusCode?: number;
}

export interface BaseOptions {
  subscriptions?: {
    timeout?: number;
  };
}

export async function requestHandler<
  TContext,
  TRouter extends Router<TContext, any, any, any>,
  TCreateContextFn extends CreateContextFn<TContext, TRequest, TResponse>,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse
>({
  req,
  res,
  router,
  endpoint,
  subscriptions,
  createContext,
}: {
  req: TRequest;
  res: TResponse;
  endpoint: string;
  router: TRouter;
  createContext: TCreateContextFn;
} & BaseOptions) {
  try {
    let data: unknown;
    const ctx = await createContext({ req, res });
    const method = req.method ?? 'GET';
    if (method === 'POST') {
      if (!router.has('mutations', endpoint)) {
        throw httpError.notFound(`Unknown mutation "${endpoint}"`);
      }

      const args = req.body.args ?? [];
      if (!Array.isArray(args)) {
        throw httpError.badRequest('Expected body.args to be an array');
      }

      data = await router.invokeMutation(ctx)(
        endpoint as any,
        ...(args as any),
      );
    } else if (method === 'GET') {
      if (!router.has('queries', endpoint)) {
        throw httpError.notFound(`Unknown query "${endpoint}"`);
      }
      const args = getQueryArgs(req);

      data = await router.invokeQuery(ctx)(endpoint as any, ...(args as any));
    } else if (method === 'PATCH') {
      if (!router.has('subscriptions', endpoint)) {
        throw httpError.notFound(`Unknown subscription "${endpoint}"`);
      }
      const args = req.body.args ?? [];
      if (!Array.isArray(args)) {
        throw httpError.badRequest('Expected body.args to be an array');
      }

      const sub: Subscription = await router.invokeSubscription(ctx)(
        endpoint as any,
        ...(args as any),
      );
      const onClose = () => {
        sub.destroy('closed');
      };

      // FIXME - refactor
      //  this is a bit complex
      // needs to handle a few cases:
      // - ok subscription
      // - error subscription
      // - request got prematurely closed
      // - request timed out
      res.once('close', onClose);
      const timeout = subscriptions?.timeout ?? 9000; // 10s is vercel's api timeout
      const timer = setTimeout(() => {
        sub.destroy('timeout');
      }, timeout);
      try {
        data = await sub.onceDataAndStop();
        res.off('close', onClose);
      } catch (err) {
        res.off('close', onClose);
        clearTimeout(timer);
        if (
          err instanceof SubscriptionDestroyError &&
          err.reason === 'timeout'
        ) {
          throw new HTTPError(
            408,
            `Subscription exceeded ${timeout}ms - please reconnect.`,
          );
        }
        throw err;
      }
    } else {
      throw httpError.badRequest(`Unexpected request method ${method}`);
    }

    const json: HTTPSuccessResponseEnvelope<unknown> = {
      ok: true,
      statusCode: res.statusCode ?? 200,
      data,
    };
    res.status(json.statusCode).json(json);
  } catch (err) {
    const json = getErrorResponseEnvelope(err);

    res.status(json.statusCode).json(json);
  }
}
