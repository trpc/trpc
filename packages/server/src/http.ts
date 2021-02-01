/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import qs from 'qs';
import { assertNotBrowser } from './assertNotBrowser';
import { InputValidationError, RouteNotFoundError } from './errors';
import { Router } from './router';
import { Subscription, SubscriptionDestroyError } from './subscription';
import { DataTransformer } from './transformer';
import url from 'url';
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
  payloadTooLarge: (message?: string) =>
    new HTTPError(413, message ?? 'Payload Too Large'),
};
export type HTTPSuccessResponseEnvelope<TOutput> = {
  ok: true;
  statusCode: number;
  data: TOutput;
};

export type HTTPErrorResponseEnvelope = {
  ok: false;
  statusCode: number;
  error: {
    message: string;
    stack?: string | undefined;
  };
};

export type HTTPResponseEnvelope<TOutput> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope;

export function getErrorResponseEnvelope(
  _err?: Partial<HTTPError> | InputValidationError<Error>,
) {
  let err = _err;
  if (err instanceof InputValidationError) {
    err = httpError.badRequest(err.message);
  } else if (err instanceof RouteNotFoundError) {
    err = httpError.notFound(err.message);
  }
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

export function getQueryInput(query: qs.ParsedQs) {
  let input: unknown = undefined;

  const queryInput = query.input;
  if (!queryInput) {
    return input;
  }
  // console.log('query', queryInput);
  if (typeof queryInput !== 'string') {
    throw httpError.badRequest('Expected query.input to be a JSON string');
  }
  try {
    input = JSON.parse(queryInput);
  } catch (err) {
    throw httpError.badRequest('Expected query.input to be a JSON string');
  }

  return input;
}

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TContext, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => TContext | Promise<TContext>;

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

export interface BaseOptions {
  subscriptions?: {
    timeout?: number;
  };
  teardown?: () => Promise<void>;
  /**
   * Optional transformer too serialize/deserialize input args + data
   */
  transformer?: DataTransformer;
  maxBodySize?: number;
}

async function getPostBody({
  req,
  maxBodySize,
}: {
  req: BaseRequest;
  maxBodySize?: number;
}) {
  return new Promise<any>((resolve, reject) => {
    if (req.body) {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', function (data) {
      body += data;
      if (typeof maxBodySize === 'number' && body.length > maxBodySize) {
        reject(httpError.payloadTooLarge());
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        reject(httpError.badRequest("Body couldn't be parsed as json"));
      }
    });
  });
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
  teardown,
  transformer = {
    serialize: (data) => data,
    deserialize: (data) => data,
  },
  maxBodySize,
}: {
  req: TRequest;
  res: TResponse;
  endpoint: string;
  router: TRouter;
  createContext: TCreateContextFn;
} & BaseOptions) {
  try {
    let output: unknown;
    const ctx = createContext && (await createContext({ req, res }));
    const method = req.method ?? 'GET';

    const deserializeInput = (input: unknown) =>
      input ? transformer.deserialize(input) : input;

    if (method === 'POST') {
      const body = await getPostBody({ req, maxBodySize });
      const input = deserializeInput(body.input);
      output = await router.invoke({
        target: 'mutations',
        input,
        ctx,
        path: endpoint,
      });
    } else if (method === 'GET') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const query = req.query ? req.query : url.parse(req.url!, true).query;
      const input = deserializeInput(getQueryInput(query));
      output = await router.invoke({
        target: 'queries',
        input,
        ctx,
        path: endpoint,
      });
    } else if (method === 'PATCH') {
      const body = await getPostBody({ req, maxBodySize });
      const input = deserializeInput(body.input);

      const sub = (await router.invoke({
        target: 'subscriptions',
        input,
        ctx,
        path: endpoint,
      })) as Subscription;
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
        output = await sub.onceOutputAndStop();

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
      data: output,
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
  } catch (err) {
    const json = getErrorResponseEnvelope(err);

    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
  }
  try {
    teardown && (await teardown());
  } catch (err) {
    console.error('Teardown failed', err);
  }
}
