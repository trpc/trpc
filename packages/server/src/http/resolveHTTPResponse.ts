/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AnyRouter,
  ProcedureType,
  callProcedure,
  inferRouterContext,
  inferRouterError,
} from '../core';
import { TRPCError, getTRPCErrorFromUnknown } from '../error/TRPCError';
import { TRPCResponse } from '../rpc';
import { getErrorShape } from '../shared/getErrorShape';
import { transformTRPCResponse } from '../shared/transformTRPCResponse';
import { Maybe } from '../types';
import {
  BaseContentTypeHandler,
  getJsonContentTypeInputs,
} from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import { HTTPHeaders, HTTPResponse } from './internals/types';
import { HTTPBaseHandlerOptions, HTTPRequest } from './types';

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: 'query',
  POST: 'mutation',
};

const fallbackContentTypeHandler = {
  getInputs: getJsonContentTypeInputs,
};

interface ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
> extends HTTPBaseHandlerOptions<TRouter, TRequest> {
  createContext: () => Promise<inferRouterContext<TRouter>>;
  req: TRequest;
  path: string;
  error?: Maybe<TRPCError>;
  contentTypeHandler?: BaseContentTypeHandler<any>;
  preprocessedBody?: boolean;
}

export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(opts: ResolveHTTPRequestOptions<TRouter, TRequest>): Promise<HTTPResponse> {
  const { router, req } = opts;
  const contentTypeHandler =
    opts.contentTypeHandler ?? fallbackContentTypeHandler;

  const batchingEnabled = opts.batching?.enabled ?? true;
  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    return {
      status: 204,
    };
  }
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined = undefined;

  const isBatchCall = !!req.query.get('batch');
  type TRouterError = inferRouterError<TRouter>;
  type TRouterResponse = TRPCResponse<unknown, TRouterError>;

  function endResponse(
    untransformedJSON: TRouterResponse | TRouterResponse[],
    errors: TRPCError[],
  ): HTTPResponse {
    let status = getHTTPStatusCode(untransformedJSON);
    const headers: HTTPHeaders = {
      'Content-Type': 'application/json',
    };

    const meta =
      opts.responseMeta?.({
        ctx,
        paths,
        type,
        data: Array.isArray(untransformedJSON)
          ? untransformedJSON
          : [untransformedJSON],
        errors,
      }) ?? {};

    for (const [key, value] of Object.entries(meta.headers ?? {})) {
      headers[key] = value;
    }
    if (meta.status) {
      status = meta.status;
    }

    const transformedJSON = transformTRPCResponse(
      router._def._config,
      untransformedJSON,
    );

    const body = JSON.stringify(transformedJSON);

    return {
      body,
      status,
      headers,
    };
  }

  try {
    if (opts.error) {
      throw opts.error;
    }
    if (isBatchCall && !batchingEnabled) {
      throw new Error(`Batching is not enabled on the server`);
    }
    /* istanbul ignore if -- @preserve */
    if (type === 'subscription') {
      throw new TRPCError({
        message: 'Subscriptions should use wsLink',
        code: 'METHOD_NOT_SUPPORTED',
      });
    }
    if (type === 'unknown') {
      throw new TRPCError({
        message: `Unexpected request method ${req.method}`,
        code: 'METHOD_NOT_SUPPORTED',
      });
    }

    const inputs = await contentTypeHandler.getInputs({
      isBatchCall,
      req,
      router,
      preprocessedBody: opts.preprocessedBody ?? false,
    });

    paths = isBatchCall ? opts.path.split(',') : [opts.path];
    ctx = await opts.createContext();

    const rawResults = await Promise.all(
      paths.map(async (path, index) => {
        const input = inputs[index];

        try {
          const output = await callProcedure({
            procedures: router._def.procedures,
            path,
            rawInput: input,
            ctx,
            type,
          });
          return {
            input,
            path,
            data: output,
          };
        } catch (cause) {
          const error = getTRPCErrorFromUnknown(cause);

          opts.onError?.({ error, path, input, ctx, type: type, req });
          return {
            input,
            path,
            error,
          };
        }
      }),
    );
    const errors = rawResults.flatMap((obj) => (obj.error ? [obj.error] : []));
    const resultEnvelopes = rawResults.map((obj): TRouterResponse => {
      const { path, input } = obj;

      if (obj.error) {
        return {
          error: getErrorShape({
            config: router._def._config,
            error: obj.error,
            type,
            path,
            input,
            ctx,
          }),
        };
      } else {
        return {
          result: {
            data: obj.data,
          },
        };
      }
    });

    const result = isBatchCall ? resultEnvelopes : resultEnvelopes[0]!;
    return endResponse(result, errors);
  } catch (cause) {
    // we get here if
    // - batching is called when it's not enabled
    // - `createContext()` throws
    // - post body is too large
    // - input deserialization fails
    // - `errorFormatter` return value is malformed
    const error = getTRPCErrorFromUnknown(cause);

    opts.onError?.({
      error,
      path: undefined,
      input: undefined,
      ctx,
      type: type,
      req,
    });
    return endResponse(
      {
        error: getErrorShape({
          config: router._def._config,
          error,
          type,
          path: undefined,
          input: undefined,
          ctx,
        }),
      },
      [error],
    );
  }
}
