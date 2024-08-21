/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  isObservable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { getErrorShape } from '../error/getErrorShape';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { ProcedureType } from '../procedure';
import {
  type AnyRouter,
  type inferRouterContext,
  type inferRouterError,
} from '../router';
import type { TRPCResponse } from '../rpc';
import { isPromise, jsonlStreamProducer } from '../stream/jsonl';
import { sseHeaders, sseStreamProducer } from '../stream/sse';
import { transformTRPCResponse } from '../transformer';
import { isAsyncIterable, isObject } from '../utils';
import { getRequestInfo } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
  TRPCRequestInfo,
} from './types';

type HTTPMethods =
  | 'GET'
  | 'POST'
  | 'HEAD'
  | 'OPTIONS'
  | 'PUT'
  | 'DELETE'
  | 'PATCH';

const TYPE_ACCEPTED_METHOD_MAP: Record<ProcedureType, HTTPMethods[]> = {
  mutation: ['POST'],
  query: ['GET'],
  subscription: ['GET'],
};
const TYPE_ACCEPTED_METHOD_MAP_WITH_METHOD_OVERRIDE: Record<
  ProcedureType,
  HTTPMethods[]
> = {
  // never allow GET to do a mutation
  mutation: ['POST'],
  query: ['GET', 'POST'],
  subscription: ['GET', 'POST'],
};

interface ResolveHTTPRequestOptions<TRouter extends AnyRouter>
  extends HTTPBaseHandlerOptions<TRouter, Request> {
  createContext: ResolveHTTPRequestOptionsContextFn<TRouter>;
  req: Request;
  path: string;
  /**
   * If the request had an issue before reaching the handler
   */
  error: TRPCError | null;
}

function initResponse<TRouter extends AnyRouter, TRequest>(initOpts: {
  ctx: inferRouterContext<TRouter> | undefined;
  info: TRPCRequestInfo | undefined;
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
  untransformedJSON:
    | TRPCResponse<unknown, inferRouterError<TRouter>>
    | TRPCResponse<unknown, inferRouterError<TRouter>>[]
    | null;
  errors: TRPCError[];
  headers: Headers;
}) {
  const {
    ctx,
    info,
    responseMeta,
    untransformedJSON,
    errors = [],
    headers,
  } = initOpts;

  let status = untransformedJSON ? getHTTPStatusCode(untransformedJSON) : 200;

  const eagerGeneration = !untransformedJSON;
  const data = eagerGeneration
    ? []
    : Array.isArray(untransformedJSON)
    ? untransformedJSON
    : [untransformedJSON];

  const meta =
    responseMeta?.({
      ctx,
      info,
      paths: info?.calls.map((call) => call.path),
      data,
      errors,
      eagerGeneration,
      type:
        info?.calls.find((call) => call.procedure?._def.type)?.procedure?._def
          .type ?? 'unknown',
    }) ?? {};

  if (meta.headers) {
    if (meta.headers instanceof Headers) {
      for (const [key, value] of meta.headers.entries()) {
        headers.append(key, value);
      }
    } else {
      /**
       * @deprecated, delete in v12
       */
      for (const [key, value] of Object.entries(meta.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else if (typeof value === 'string') {
          headers.set(key, value);
        }
      }
    }
  }
  if (meta.status) {
    status = meta.status;
  }

  return {
    status,
  };
}

function caughtErrorToData<TRouter extends AnyRouter>(
  cause: unknown,
  errorOpts: {
    opts: Pick<
      ResolveHTTPRequestOptions<TRouter>,
      'onError' | 'req' | 'router'
    >;
    ctx: inferRouterContext<TRouter> | undefined;
    type: ProcedureType | 'unknown';
    path?: string;
    input?: unknown;
  },
) {
  const { router, req, onError } = errorOpts.opts;
  const error = getTRPCErrorFromUnknown(cause);
  onError?.({
    error,
    path: errorOpts.path,
    input: errorOpts.input,
    ctx: errorOpts.ctx,
    type: errorOpts.type,
    req,
  });
  const untransformedJSON = {
    error: getErrorShape({
      config: router._def._config,
      error,
      type: errorOpts.type,
      path: errorOpts.path,
      input: errorOpts.input,
      ctx: errorOpts.ctx,
    }),
  };
  const transformedJSON = transformTRPCResponse(
    router._def._config,
    untransformedJSON,
  );
  const body = JSON.stringify(transformedJSON);
  return {
    error,
    untransformedJSON,
    body,
  };
}

/**
 * Check if a value is a stream-like object
 * - if it's an async iterable
 * - if it's an object with async iterables or promises
 */
function isDataStream(v: unknown) {
  if (!isObject(v)) {
    return false;
  }

  if (isAsyncIterable(v)) {
    return true;
  }

  return (
    Object.values(v).some(isPromise) || Object.values(v).some(isAsyncIterable)
  );
}

export async function resolveResponse<TRouter extends AnyRouter>(
  opts: ResolveHTTPRequestOptions<TRouter>,
): Promise<Response> {
  const { router, req } = opts;
  const headers = new Headers([['vary', 'trpc-accept']]);
  const config = router._def._config;

  const url = new URL(req.url);

  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    return new Response(null, {
      status: 204,
    });
  }

  const allowBatching = opts.allowBatching ?? opts.batching?.enabled ?? true;
  const allowMethodOverride =
    (opts.allowMethodOverride ?? false) && req.method === 'POST';
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let info: TRPCRequestInfo | undefined = undefined;

  const methodMapper = allowMethodOverride
    ? TYPE_ACCEPTED_METHOD_MAP_WITH_METHOD_OVERRIDE
    : TYPE_ACCEPTED_METHOD_MAP;

  /**
   * @deprecated
   */
  const isStreamCall = req.headers.get('trpc-accept') === 'application/jsonl';

  const experimentalIterablesAndDeferreds =
    router._def._config.experimental?.iterablesAndDeferreds ?? true;
  const experimentalSSE =
    router._def._config.experimental?.sseSubscriptions?.enabled ?? true;
  try {
    info = getRequestInfo({
      req,
      path: decodeURIComponent(opts.path),
      router,
      searchParams: url.searchParams,
      headers: opts.req.headers,
    });

    // we create context early so that error handlers may access context information
    ctx = await opts.createContext({
      info,
    });

    if (opts.error) {
      throw opts.error;
    }
    if (info.isBatchCall && !allowBatching) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Batching is not enabled on the server`,
      });
    }
    /* istanbul ignore if -- @preserve */
    if (isStreamCall && !info.isBatchCall) {
      throw new TRPCError({
        message: `Streaming requests must be batched (you can do a batch of 1)`,
        code: 'BAD_REQUEST',
      });
    }

    type RPCResult =
      | [result: null, error: TRPCError]
      | [result: unknown, error?: never];
    const rpcCalls = info.calls.map(async (call): Promise<RPCResult> => {
      const proc = call.procedure;
      try {
        if (!proc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No procedure found on path "${call.path}"`,
          });
        }

        if (!methodMapper[proc._def.type].includes(req.method as HTTPMethods)) {
          throw new TRPCError({
            code: 'METHOD_NOT_SUPPORTED',
            message: `Unsupported ${req.method}-request to ${proc._def.type} procedure at path "${call.path}"`,
          });
        }
        /* istanbul ignore if -- @preserve */
        if (proc._def.type === 'subscription' && info!.isBatchCall) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot batch subscription calls`,
          });
        }
        const data: unknown = await proc({
          path: call.path,
          getRawInput: call.getRawInput,
          ctx,
          type: proc._def.type,
        });
        return [data];
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        const input = call.result();

        opts.onError?.({
          error,
          path: call.path,
          input,
          ctx,
          type: call.procedure?._def.type ?? 'unknown',
          req: opts.req,
        });

        return [null, error];
      }
    });

    // ----------- response handlers -----------
    if (!info.isBatchCall) {
      const [call] = info.calls;
      const [data, error] = await rpcCalls[0]!;

      switch (info.type) {
        case 'unknown':
        case 'mutation':
        case 'query': {
          // httpLink
          headers.set('content-type', 'application/json');

          if (isDataStream(data)) {
            throw new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message:
                'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
            });
          }
          const res: TRPCResponse<unknown, inferRouterError<TRouter>> = error
            ? {
                error: getErrorShape({
                  config,
                  ctx,
                  error,
                  input: call!.result(),
                  path: call!.path,
                  type: info.type,
                }),
              }
            : { result: { data } };

          const headResponse = initResponse({
            ctx,
            info,
            responseMeta: opts.responseMeta,
            errors: error ? [error] : [],
            headers,
            untransformedJSON: [res],
          });
          return new Response(
            JSON.stringify(transformTRPCResponse(config, res)),
            {
              status: headResponse.status,
              headers,
            },
          );
        }
        case 'subscription': {
          // httpSubscriptionLink

          if (!experimentalSSE) {
            throw new TRPCError({
              code: 'METHOD_NOT_SUPPORTED',
              message: 'Missing experimental flag "sseSubscriptions"',
            });
          }

          if (!isObservable(data) && !isAsyncIterable(data)) {
            throw new TRPCError({
              message: `Subscription ${
                call!.path
              } did not return an observable or a AsyncGenerator`,
              code: 'INTERNAL_SERVER_ERROR',
            });
          }
          const dataAsIterable = isObservable(data)
            ? observableToAsyncIterable(data)
            : data;
          const stream = sseStreamProducer({
            ...config.experimental?.sseSubscriptions,
            data: dataAsIterable,
            serialize: (v) => config.transformer.output.serialize(v),
            formatError(errorOpts) {
              const shape = getErrorShape({
                config,
                ctx,
                error: getTRPCErrorFromUnknown(errorOpts.error),
                input: call?.result(),
                path: call?.path,
                type: call?.procedure?._def.type ?? 'unknown',
              });

              return shape;
            },
          });
          for (const [key, value] of Object.entries(sseHeaders)) {
            headers.set(key, value);
          }

          const headResponse = initResponse({
            ctx,
            info,
            responseMeta: opts.responseMeta,
            errors: [],
            headers,
            untransformedJSON: null,
          });

          return new Response(stream, {
            headers,
            status: headResponse.status,
          });
        }
      }
    }

    // batch response handlers
    if (info.accept === 'application/jsonl') {
      // httpBatchStreamLink
      headers.set('content-type', 'application/json');
      headers.set('transfer-encoding', 'chunked');
      const headResponse = initResponse({
        ctx,
        info,
        responseMeta: opts.responseMeta,
        errors: [],
        headers,
        untransformedJSON: null,
      });
      const stream = jsonlStreamProducer({
        /**
         * Example structure for `maxDepth: 4`:
         * {
         *   // 1
         *   0: {
         *     // 2
         *     result: {
         *       // 3
         *       data: // 4
         *     }
         *   }
         * }
         */
        maxDepth: experimentalIterablesAndDeferreds ? 4 : 3,
        data: rpcCalls.map(async (res) => {
          const [result, error] = await res;

          const call = info!.calls[0];
          if (error) {
            return {
              error: getErrorShape({
                config,
                ctx,
                error,
                input: call!.result(),
                path: call!.path,
                type: call!.procedure?._def.type ?? 'unknown',
              }),
            };
          }

          /**
           * Not very pretty, but we need to wrap nested data in promises
           * Our stream producer will only resolve top-level async values or async values that are directly nested in another async value
           */
          const data = isObservable(result)
            ? observableToAsyncIterable(result)
            : Promise.resolve(result);
          return {
            result: Promise.resolve({
              data,
            }),
          };
        }),
        serialize: config.transformer.output.serialize,
        onError: (cause) => {
          opts.onError?.({
            error: getTRPCErrorFromUnknown(cause),
            path: undefined,
            input: undefined,
            ctx,
            req: opts.req,
            type: info?.type ?? 'unknown',
          });
        },

        formatError(errorOpts) {
          const call = info?.calls[errorOpts.path[0] as any];

          const shape = getErrorShape({
            config,
            ctx,
            error: getTRPCErrorFromUnknown(errorOpts.error),
            input: call?.result(),
            path: call?.path,
            type: call?.procedure?._def.type ?? 'unknown',
          });

          return shape;
        },
      });

      return new Response(stream, {
        headers,
        status: headResponse.status,
      });
    }

    // httpBatchLink
    /**
     * Non-streaming response:
     * - await all responses in parallel, blocking on the slowest one
     * - create headers with known response body
     * - return a complete HTTPResponse
     */
    headers.set('content-type', 'application/json');
    const results: RPCResult[] = (await Promise.all(rpcCalls)).map(
      (res): RPCResult => {
        const [data, error] = res;
        if (error) {
          return res;
        }

        if (isDataStream(data)) {
          return [
            null,
            new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message:
                'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
            }),
          ];
        }
        return res;
      },
    );
    const resultAsRPCResponse = results.map(
      (
        [data, error],
        index,
      ): TRPCResponse<unknown, inferRouterError<TRouter>> => {
        const call = info!.calls[index]!;
        if (error) {
          return {
            error: getErrorShape({
              config,
              ctx,
              error,
              input: call.result(),
              path: call.path,
              type: call.procedure?._def.type ?? 'unknown',
            }),
          };
        }
        return {
          result: { data },
        };
      },
    );

    const errors = results
      .map(([_, error]) => error)
      .filter(Boolean) as TRPCError[];

    const headResponse = initResponse({
      ctx,
      info,
      responseMeta: opts.responseMeta,
      untransformedJSON: resultAsRPCResponse,
      errors,
      headers,
    });

    return new Response(
      JSON.stringify(transformTRPCResponse(config, resultAsRPCResponse)),
      {
        status: headResponse.status,
        headers,
      },
    );
  } catch (cause) {
    // we get here if
    // - batching is called when it's not enabled
    // - `createContext()` throws
    // - `router._def._config.transformer.output.serialize()` throws
    // - post body is too large
    // - input deserialization fails
    // - `errorFormatter` return value is malformed
    const { error, untransformedJSON, body } = caughtErrorToData(cause, {
      opts,
      ctx,
      type: info?.type ?? 'unknown',
    });

    const headResponse = initResponse({
      ctx,
      info,
      responseMeta: opts.responseMeta,
      untransformedJSON,
      errors: [error],
      headers,
    });

    return new Response(body, {
      status: headResponse.status,
      headers,
    });
  }
}
