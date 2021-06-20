/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { getErrorFromUnknown, TRPCError } from '../errors';
import { deprecateTransformWarning } from '../internals/once';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { TRPCErrorResponse, TRPCResponse } from '../rpc';
import { Subscription } from '../subscription';
import { DataTransformerOptions } from '../transformer';
import { getHTTPStatusCode } from './internals/getHTTPStatusCode';
import { getPostBody } from './internals/getPostBody';
import { getQueryInput } from './internals/getQueryInput';

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
   * @deprecated use `router.transformer()`
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
  batching?: {
    enabled: boolean;
  };
}

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: 'query',
  POST: 'mutation',
  PATCH: 'subscription',
};

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
  events: NodeJS.EventEmitter;
}): Promise<unknown> {
  const { type, path, input, subscriptions, caller, events: events } = opts;
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
        events.off('close', onClose);
        events.off('flush', flush);
        clearTimeout(requestTimeoutTimer);
        clearTimeout(backpressureTimer);
        sub.destroy();
      }

      const flush = () => {
        cleanup();
        resolve(buffer);
      };
      function onData(data: unknown) {
        buffer.push(data);

        const requestTimeLeft = requestTimeoutMs - (Date.now() - startTime);

        /* istanbul ignore next */
        if (requestTimeLeft <= backpressureMs) {
          // will timeout before next backpressure tick
          flush();
          return;
        }
        if (!backpressureTimer) {
          backpressureTimer = setTimeout(flush, backpressureMs);
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
        reject(new TRPCError({ code: 'CLIENT_CLOSED_REQUEST' }));
      }
      function onRequestTimeout() {
        cleanup();
        reject(
          new TRPCError({
            message: `Subscription exceeded ${requestTimeoutMs}ms - please reconnect.`,
            code: 'TIMEOUT',
          }),
        );
      }
      /* istanbul ignore next */
      function onDestroy() {
        reject(new Error(`Subscription was destroyed prematurely`));
        cleanup();
      }

      sub.on('data', onData);
      sub.on('error', onError);
      sub.on('destroy', onDestroy);
      events.once('close', onClose);
      events.once('flush', flush);
      requestTimeoutTimer = setTimeout(onRequestTimeout, requestTimeoutMs);
      sub.start();
    });
  }
  /* istanbul ignore next */
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
  if (opts.transformer) {
    deprecateTransformWarning();
  }
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? ('unknown' as const);
  let input: unknown = undefined;
  let ctx: inferRouterContext<TRouter> | undefined = undefined;

  // backwards compat - add transformer to router
  // TODO - remove in next major
  const router = opts.transformer
    ? opts.router.transformer(opts.transformer)
    : opts.router;

  const reqQueryParams = req.query
    ? req.query
    : url.parse(req.url!, true).query;
  const isBatchCall = reqQueryParams.batch;
  function endResponse(json: TRPCResponse | TRPCResponse[]) {
    res.statusCode = getHTTPStatusCode(json);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(json));
  }
  try {
    if (isBatchCall && !opts.batching?.enabled) {
      throw new Error(`Batching is not enabled on the server`);
    }
    if (type === 'unknown') {
      throw new TRPCError({
        message: `Unexpected request method ${req.method}`,
        code: 'METHOD_NOT_SUPPORTED',
      });
    }
    const rawInput = await getInputFromRequest({
      maxBodySize,
      req,
      type,
    });

    input =
      rawInput !== undefined
        ? router._def.transformer.deserialize(rawInput)
        : undefined;
    ctx = await createContext?.({ req, res });

    const caller = router.createCaller(ctx);
    const getInputs = (): unknown[] => {
      if (!isBatchCall) {
        return [input];
      }
      /* istanbul ignore next */
      if (!Array.isArray(input)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an array when doing a batch call',
        });
      }
      return input;
    };
    const inputs = getInputs();
    const paths = isBatchCall ? opts.path.split(',') : [opts.path];
    const events = req;

    const results = await Promise.all(
      paths.map(async (path, index) => {
        try {
          const output = await callProcedure({
            caller,
            path,
            input: inputs[index],
            events,
            subscriptions,
            type,
          });
          const json: TRPCResponse = {
            id: -1,
            result: {
              type: 'data',
              data: router._def.transformer.serialize(output),
            },
          };
          events.emit('flush'); // `flush()` is used for subscriptions to flush out current output
          return json;
        } catch (_err) {
          const error = getErrorFromUnknown(_err);

          const json: TRPCErrorResponse = {
            id: -1,
            error: router._def.transformer.serialize(
              router.getErrorShape({ error, type, path, input, ctx }),
            ),
          };
          onError?.({ error, path, input, ctx, type: type, req });
          return json;
        }
      }),
    );

    const result = isBatchCall ? results : results[0];
    endResponse(result);
  } catch (_err) {
    const error = getErrorFromUnknown(_err);

    const json: TRPCErrorResponse = {
      id: -1,
      error: router._def.transformer.serialize(
        router.getErrorShape({ error, type, path: undefined, input, ctx }),
      ),
    };
    endResponse(json);
    onError?.({ error, path: undefined, input, ctx, type: type, req });
  }
  await teardown?.();
}
