/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { getErrorShape } from '../error/getErrorShape';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { ProcedureType } from '../procedure';
import {
  callProcedure,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterError,
} from '../router';
import type { TRPCResponse } from '../rpc';
import { isPromise, jsonlStreamProducer } from '../stream/stream';
import { transformTRPCResponse } from '../transformer';
import { isObject } from '../utils';
import { getRequestInfo } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
  TRPCRequestInfo,
} from './types';

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: 'query',
  POST: 'mutation',
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
  type: ProcedureType | 'unknown';
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
  untransformedJSON?:
    | TRPCResponse<unknown, inferRouterError<TRouter>>
    | TRPCResponse<unknown, inferRouterError<TRouter>>[]
    | undefined;
  errors: TRPCError[];
  headers: Headers;
}) {
  const {
    ctx,
    info,
    type,
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
      type,
      data,
      errors,
      eagerGeneration,
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

export async function resolveResponse<TRouter extends AnyRouter>(
  opts: ResolveHTTPRequestOptions<TRouter>,
): Promise<Response> {
  const { router, req } = opts;
  const headers = new Headers([['vary', 'trpc-accept']]);

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

  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let info: TRPCRequestInfo | undefined = undefined;

  const isStreamCall = req.headers.get('trpc-accept') === 'application/jsonl';

  const experimentalIterablesAndDeferreds =
    router._def._config.experimental?.iterablesAndDeferreds ?? false;

  try {
    info = getRequestInfo({
      req,
      path: decodeURIComponent(opts.path),
      config: router._def._config,
      searchParams: url.searchParams,
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
    if (type === 'unknown') {
      throw new TRPCError({
        message: `Unexpected request method ${req.method}`,
        code: 'METHOD_NOT_SUPPORTED',
      });
    }

    const errors: TRPCError[] = [];

    const promises: Promise<
      TRPCResponse<unknown, inferRouterError<TRouter>>
    >[] = info.calls.map(async (call) => {
      try {
        const data = await callProcedure({
          procedures: opts.router._def.procedures,
          path: call.path,
          getRawInput: call.getRawInput,
          ctx,
          type,
          allowMethodOverride,
        });

        if (
          (!isStreamCall || !experimentalIterablesAndDeferreds) &&
          isObject(data) &&
          (Symbol.asyncIterator in data || Object.values(data).some(isPromise))
        ) {
          if (!isStreamCall) {
            throw new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message:
                'Cannot return async iterable or nested promises in non-streaming response',
            });
          }
          if (!experimentalIterablesAndDeferreds) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Missing experimental flag "iterablesAndDeferreds"',
            });
          }
        }

        return {
          result: {
            data,
          },
        };
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        errors.push(error);
        const input = call.result();

        opts.onError?.({
          error,
          path: call.path,
          input,
          ctx,
          type: type,
          req: opts.req,
        });

        return {
          error: getErrorShape({
            config: opts.router._def._config,
            error,
            type,
            path: call.path,
            input,
            ctx,
          }),
        };
      }
    });
    if (!isStreamCall) {
      headers.set('content-type', 'application/json');
      /**
       * Non-streaming response:
       * - await all responses in parallel, blocking on the slowest one
       * - create headers with known response body
       * - return a complete HTTPResponse
       */

      const untransformedJSON = await Promise.all(promises);

      const errors = untransformedJSON.flatMap((response) =>
        'error' in response ? [response.error] : [],
      );

      const headResponse = initResponse({
        ctx,
        info,
        type,
        responseMeta: opts.responseMeta,
        untransformedJSON,
        errors,
        headers,
      });

      // return body stuff
      const result = info.isBatchCall
        ? untransformedJSON
        : untransformedJSON[0]!;
      const transformedJSON = transformTRPCResponse(
        router._def._config,
        result,
      );
      const body = JSON.stringify(transformedJSON);

      return new Response(body, {
        status: headResponse.status,
        headers,
      });
    }

    headers.set('content-type', 'application/json');
    headers.set('transfer-encoding', 'chunked');
    /**
     * Streaming response:
     * - block on none, call `onChunk` as soon as each response is ready
     * - create headers with minimal data (cannot know the response body in advance)
     * - return void
     */
    const headResponse = initResponse({
      ctx,
      info,
      type,
      responseMeta: opts.responseMeta,
      errors: [],
      headers,
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
      data: promises.map(async (it) => {
        const response = await it;
        if ('result' in response) {
          /**
           * Not very pretty, but we need to wrap nested data in promises
           * Our stream producer will only resolve top-level async values or async values that are directly nested in another async value
           */
          return {
            ...response,
            result: Promise.resolve({
              ...response.result,
              data: Promise.resolve(response.result.data),
            }),
          };
        }
        return response;
      }),
      serialize: opts.router._def._config.transformer.output.serialize,
      onError: (cause) => {
        opts.onError?.({
          error: getTRPCErrorFromUnknown(cause),
          path: undefined,
          input: undefined,
          ctx,
          type,
          req: opts.req,
        });
      },
    });

    return new Response(stream, {
      headers,
      status: headResponse.status,
    });
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
      type,
    });

    const headResponse = initResponse({
      ctx,
      info,
      type,
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
