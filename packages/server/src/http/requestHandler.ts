/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { getErrorFromUnknown, TRPCError } from '../errors';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { Subscription } from '../subscription';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
} from '../transformer';
import { getStatusCodeFromError, HTTPError } from './errors';
import {
  HTTPErrorResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from './index';
import { getPostBody } from './internal/getPostBody';
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

function getCombinedDataTransformer(
  transformer: DataTransformerOptions | undefined = {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
): CombinedDataTransformer {
  const combinedTransformer =
    'input' in transformer
      ? transformer
      : { input: transformer, output: transformer };

  return combinedTransformer;
}

/**
 * Resolve input from request
 */
async function getInputFromRequest({
  req,
  type,
  maxBodySize,
}: {
  req: BaseRequest;
  type: ProcedureType;
  maxBodySize: number | undefined;
}) {
  if (type === 'query') {
    const query = req.query ? req.query : url.parse(req.url!, true).query;
    const input = getQueryInput(query);
    return input;
  }

  const body = await getPostBody({ req, maxBodySize });
  return body.input;
}

/**
 * Call procedure and get output
 */
async function callProcedure<TRouter extends AnyRouter>(opts: {
  path: string;
  input: unknown;
  caller: ReturnType<TRouter['createCaller']>;
  type: ProcedureType;
  subscriptions: BaseOptions<any, any>['subscriptions'] | undefined;
  reqEvents: NodeJS.EventEmitter;
}): Promise<unknown> {
  const { type, path, input, subscriptions, caller, reqEvents } = opts;
  if (type === 'query') {
    return caller.query(path, input);
  }
  if (type === 'mutation') {
    return caller.mutation(path, input);
  }
  if (type === 'subscription') {
    const sub = (await caller.subscription(path, input)) as Subscription;

    return new Promise((resolve, reject) => {
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
        reqEvents.off('close', onClose);
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
      reqEvents.once('close', onClose);
      requestTimeoutTimer = setTimeout(onRequestTimeout, requestTimeoutMs);
      sub.start();
    });
  }

  throw new Error(`Unknown procedure type ${type}`);
}

export async function requestHandler<
  TRouter extends AnyRouter,
  TCreateContextFn extends CreateContextFn<TRouter, TRequest, TResponse>,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
>(
  opts: {
    req: TRequest;
    res: TResponse;
    path: string;
    router: TRouter;
    createContext: TCreateContextFn;
  } & BaseOptions<TRouter, TRequest>,
) {
  const {
    req,
    res,
    router,
    path,
    createContext,
    teardown,
    onError,
    maxBodySize,
    subscriptions,
  } = opts;
  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    res.statusCode = 204;
    res.end();
    return;
  }
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? ('unknown' as const);
  let input: unknown = undefined;
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  const transformer = getCombinedDataTransformer(opts.transformer);
  try {
    if (type === 'unknown') {
      throw new HTTPError(`Unexpected request method ${req.method}`, {
        statusCode: 405,
        code: 'BAD_USER_INPUT',
      });
    }
    const rawInput = await getInputFromRequest({
      maxBodySize,
      req,
      type,
    });
    input = transformer.input.deserialize(rawInput);
    ctx = await createContext?.({ req, res });

    const caller = router.createCaller(ctx);

    const output = await callProcedure({
      caller,
      path,
      input,
      reqEvents: req,
      subscriptions,
      type,
    });
    const json: HTTPSuccessResponseEnvelope<unknown> = {
      ok: true,
      statusCode: res.statusCode ?? 200,
      data: output,
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.output.serialize(json)));
  } catch (_err) {
    const error = getErrorFromUnknown(_err);

    const json: HTTPErrorResponseEnvelope<TRouter> = {
      ok: false,
      statusCode: getStatusCodeFromError(error),
      error: router.getErrorShape({ error, type, path, input, ctx }),
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.output.serialize(json)));
    onError && onError({ error, path, input, ctx, type: type, req });
  }
  try {
    teardown && (await teardown());
  } catch (err) {
    throw new Error('Teardown failed ' + err?.message);
  }
}
