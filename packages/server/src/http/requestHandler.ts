/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { getErrorFromUnknown, TRPCError } from '../errors';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { Subscription } from '../subscription';
import { DataTransformerOptions } from '../transformer';
import { getStatusCodeFromError, HTTPError } from './errors';
import { getPostBody } from './internal/getPostBody';
import {
  HTTPErrorResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from './index';
import { getQueryInput } from './internal/getQueryInput';
assertNotBrowser();

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

export interface BaseOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
> {
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
  transformer?: DataTransformerOptions;
  maxBodySize?: number;
  onError?: (opts: {
    error: TRPCError;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    req: TRequest;
    input: unknown;
    ctx: undefined | inferRouterContext<TRouter>;
  }) => void;
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
  TResponse extends BaseResponse,
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
} & BaseOptions<TRouter, TRequest>) {
  let type: 'unknown' | ProcedureType = 'unknown';
  let input: unknown = undefined;
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  const combinedTransformer =
    'input' in transformer
      ? transformer
      : { input: transformer, output: transformer };
  try {
    let output: unknown;

    ctx = createContext && (await createContext({ req, res }));
    const method = req.method;

    const deserializeInput = (input: unknown) =>
      input ? combinedTransformer.input.deserialize(input) : input;

    const caller = router.createCaller(ctx);
    type = HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? 'unknown';
    const getInput = async () => {
      if (type === 'query') {
        const query = req.query ? req.query : url.parse(req.url!, true).query;
        const input = getQueryInput(query);
        return deserializeInput(input);
      }
      if (type === 'mutation' || type === 'subscription') {
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
    } else if (type === 'query') {
      output = await caller.query(path, input);
    } else if (type === 'mutation') {
      output = await caller.mutation(path, input);
    } else if (type === 'subscription') {
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
          reject(
            new HTTPError(`Client Closed Request`, {
              statusCode: 499,
              code: 'BAD_USER_INPUT',
            }),
          );
        }
        function onRequestTimeout() {
          cleanup();
          reject(
            new HTTPError(
              `Subscription exceeded ${requestTimeoutMs}ms - please reconnect.`,
              { statusCode: 408, code: 'TIMEOUT' },
            ),
          );
        }

        function onDestroy() {
          reject(new Error(`Subscription was destroyed prematurely`));
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
        code: 'BAD_USER_INPUT',
      });
    }
    const json: HTTPSuccessResponseEnvelope<unknown> = {
      ok: true,
      statusCode: res.statusCode ?? 200,
      data: output,
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(combinedTransformer.output.serialize(json)));
  } catch (_err) {
    const error = getErrorFromUnknown(_err);

    const json: HTTPErrorResponseEnvelope<TRouter> = {
      ok: false,
      statusCode: getStatusCodeFromError(error),
      error: router.getErrorShape({ error, type, path, input, ctx }),
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(combinedTransformer.output.serialize(json)));
    onError && onError({ error, path, input, ctx, type: type, req });
  }
  try {
    teardown && (await teardown());
  } catch (err) {
    throw new Error('Teardown failed ' + err?.message);
  }
}
