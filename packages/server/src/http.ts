/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from './assertNotBrowser';
import {
  getErrorFromUnknown,
  inputValidationError,
  TRPCError,
  TRPCErrorOptions,
} from './errors';
import { AnyRouter, inferRouterContext, ProcedureType } from './router';
import { Subscription } from './subscription';
import { DataTransformer } from './transformer';
import { Dict } from './types';
assertNotBrowser();

export type HTTPSuccessResponseEnvelope<TOutput> = {
  ok: true;
  statusCode: number;
  data: TOutput;
};

export type HTTPErrorResponseEnvelope = {
  ok: false;
  statusCode: number;
  error: {
    path?: string;
    message: string;
    code: string;
    stack?: string | undefined;
  };
};

export type HTTPResponseEnvelope<TOutput> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope;

const STATUS_CODE_MAP: Dict<number> = {
  BAD_USER_INPUT: 400,
  INTERAL_SERVER_ERROR: 500,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
};
export interface HttpErrorOptions extends TRPCErrorOptions {
  statusCode: number;
}
export class HTTPError extends TRPCError<'HTTP_ERROR'> {
  public readonly statusCode: number;

  constructor(message: string, opts: HttpErrorOptions) {
    super({ message, code: 'HTTP_ERROR', ...opts });
    this.statusCode = opts.statusCode;

    // this is set to TRPCError as `instanceof TRPCError` doesn't seem to work on error sub-classes
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}
/* istanbul ignore next */
export const httpError = {
  forbidden: (message?: string) =>
    new HTTPError(message ?? 'Forbidden', { statusCode: 403 }),
  unauthorized: (message?: string) =>
    new HTTPError(message ?? 'Unauthorized', { statusCode: 401 }),
  badRequest: (message?: string) =>
    new HTTPError(message ?? 'Bad Request', { statusCode: 400 }),
  notFound: (message?: string) =>
    new HTTPError(message ?? 'Not found', { statusCode: 404 }),
};

export function getStatusCodeFromError(err: TRPCError): number {
  const statusCodeFromError = (err as any)?.statusCode;
  if (typeof statusCodeFromError === 'number') {
    return statusCodeFromError;
  }
  return STATUS_CODE_MAP[err.code] ?? 500;
}

export function getErrorResponseEnvelope({
  error,
  path,
}: {
  error: TRPCError;
  path: undefined | string;
}) {
  const json: HTTPErrorResponseEnvelope = {
    ok: false,
    statusCode: getStatusCodeFromError(error),
    error: {
      message: error.message,
      code: error.code,
      path,
    },
  };
  if (
    process.env.NODE_ENV !== 'production' &&
    typeof error.stack === 'string'
  ) {
    json.error.stack = error.stack;
  }

  return json;
}

export function getQueryInput(query: qs.ParsedQs) {
  const queryInput = query.input;
  if (!queryInput) {
    return undefined;
  }
  try {
    return JSON.parse(queryInput as string);
  } catch (err) {
    throw inputValidationError('Expected query.input to be a JSON string');
  }
}

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TRouter extends AnyRouter, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

export interface BaseOptions<TRouter extends AnyRouter> {
  subscriptions?: {
    /**
     * Time in milliseconds before `408` is sent
     */
    requestTimeoutMs?: number;
    /**
     * Allow for some backpressure and batch send events every X ms
     */
    backpressureMs?: number;
  };
  teardown?: () => Promise<void>;
  /**
   * Optional transformer too serialize/deserialize input args + data
   */
  transformer?: DataTransformer;
  maxBodySize?: number;
  onError?: (opts: {
    error: TRPCError;
    procedureType: ProcedureType | 'unknown';
    path: string | undefined;
    req: BaseRequest;
    input: unknown;
    ctx: undefined | inferRouterContext<TRouter>;
  }) => void;
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
        reject(new HTTPError('Payload Too Large', { statusCode: 413 }));
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        reject(
          new HTTPError("Body couldn't be parsed as json", { statusCode: 400 }),
        );
      }
    });
  });
}

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: 'query',
  POST: 'mutation',
  PATCH: 'subscription',
};

export async function requestHandler<
  TRouter extends AnyRouter,
  TCreateContextFn extends CreateContextFn<TRouter, TRequest, TResponse>,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse
>({
  req,
  res,
  router,
  path,
  subscriptions,
  createContext,
  teardown,
  transformer = {
    serialize: (data) => data,
    deserialize: (data) => data,
  },
  maxBodySize,
  onError,
}: {
  req: TRequest;
  res: TResponse;
  path: string;
  router: TRouter;
  createContext: TCreateContextFn;
} & BaseOptions<TRouter>) {
  let procedureType: 'unknown' | ProcedureType = 'unknown';
  let input: unknown = undefined;
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  try {
    let output: unknown;

    ctx = createContext && (await createContext({ req, res }));
    const method = req.method;

    const deserializeInput = (input: unknown) =>
      input ? transformer.deserialize(input) : input;

    const caller = router.createCaller(ctx);
    procedureType = HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? 'unknown';
    const getInput = async () => {
      if (procedureType === 'query') {
        const query = req.query ? req.query : url.parse(req.url!, true).query;
        const input = getQueryInput(query);
        return deserializeInput(input);
      }
      if (procedureType === 'mutation' || procedureType === 'subscription') {
        const body = await getPostBody({ req, maxBodySize });
        const input = deserializeInput(body.input);
        return input;
      }
      return undefined;
    };
    input = await getInput();

    if (method === 'HEAD') {
      res.statusCode = 204;
      res.end();
      return;
    } else if (procedureType === 'query') {
      output = await caller.query(path, input);
    } else if (procedureType === 'mutation') {
      output = await caller.mutation(path, input);
    } else if (procedureType === 'subscription') {
      const sub = (output = await caller.subscription(
        path,
        input,
      )) as Subscription;

      output = await new Promise((resolve, reject) => {
        const startTime = Date.now();

        const buffer: unknown[] = [];

        const requestTimeoutMs = subscriptions?.requestTimeoutMs ?? 9000; // 10s is vercel's api timeout
        const backpressureMs = subscriptions?.backpressureMs ?? 0;

        // timers
        let backpressureTimer: any = null;
        let requestTimeoutTimer: any = null;

        function cleanup() {
          sub.off('data', onData);
          sub.off('error', onError);
          sub.off('destroy', onDestroy);
          req.off('close', onClose);
          res.off('close', onClose);
          clearTimeout(requestTimeoutTimer);
          clearTimeout(backpressureTimer);
          sub.destroy();
        }
        function onData(data: unknown) {
          buffer.push(data);

          const requestTimeLeft = requestTimeoutMs - (Date.now() - startTime);

          const success = () => {
            cleanup();
            resolve(buffer);
          };
          if (requestTimeLeft <= backpressureMs) {
            // will timeout before next backpressure tick
            success();
            return;
          }
          if (!backpressureTimer) {
            backpressureTimer = setTimeout(success, backpressureMs);
            return;
          }
        }
        function onError(err: Error) {
          cleanup();
          // maybe if `buffer` has length here we should just return instead?
          reject(err);
        }
        function onClose() {
          cleanup();
          reject(new HTTPError(`Client Closed Request`, { statusCode: 499 }));
        }
        function onRequestTimeout() {
          cleanup();
          reject(
            new HTTPError(
              `Subscription exceeded ${requestTimeoutMs}ms - please reconnect.`,
              { statusCode: 408 },
            ),
          );
        }

        function onDestroy() {
          reject(
            new HTTPError(`Subscription was destroyed prematurely`, {
              statusCode: 500,
            }),
          );
          cleanup();
        }

        sub.on('data', onData);
        sub.on('error', onError);
        sub.on('destroy', onDestroy);
        req.once('close', onClose);
        res.once('close', onClose);
        requestTimeoutTimer = setTimeout(onRequestTimeout, requestTimeoutMs);
        sub.start();
      });
    } else {
      throw new HTTPError(`Unexpected request method ${method}`, {
        statusCode: 405,
      });
    }
    const json: HTTPSuccessResponseEnvelope<unknown> = {
      ok: true,
      statusCode: res.statusCode ?? 200,
      data: output,
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
  } catch (_err) {
    const error = getErrorFromUnknown(_err);
    const json = getErrorResponseEnvelope({ error, path });

    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
    onError && onError({ error, path, input, ctx, procedureType, req });
  }
  try {
    teardown && (await teardown());
  } catch (err) {
    throw new Error('Teardown failed ' + err?.message);
  }
}
