import { AnyRouter, callProcedure, inferRouterContext, inferRouterError, ProcedureType } from '../core';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import { TRPCResponse } from '../rpc';
import { getErrorShape } from '../shared/getErrorShape';
import { Maybe } from '../types';
import { buildResponse } from './buildResponse';
import { BaseContentTypeHandler, getJsonContentTypeInputs } from './contentType';
import { HTTPResponse, StreamHTTPResponse } from './internals/types';
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

type ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
> = HTTPBaseHandlerOptions<TRouter, TRequest> & {
  createContext: () => Promise<inferRouterContext<TRouter>>;
  req: TRequest;
  path: string;
  error?: Maybe<TRPCError>;
  contentTypeHandler?: BaseContentTypeHandler<any>;
  preprocessedBody?: boolean;
} & (
    | {
        unstable_streamSupport:
          | ['sse', 'json']
          | ['json', 'sse']
          | ['json']
          | ['sse']
          | [];
      }
    | { unstable_streamSupport?: undefined }
  );

async function getRawProcedureResult<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(procedureOpts: {
  opts: Pick<
    ResolveHTTPRequestOptions<TRouter, TRequest>,
    'onError' | 'req' | 'router'
  >;
  ctx: inferRouterContext<TRouter> | undefined;
  type: 'mutation' | 'query';
  input: unknown;
  path: string;
}): Promise<TRPCResponse<unknown, inferRouterError<TRouter>>> {
  const { opts, ctx, type, input, path } = procedureOpts;
  try {
    const data = await callProcedure({
      procedures: opts.router._def.procedures,
      path,
      rawInput: input,
      ctx,
      type,
    });
    return {
      result: {
        data,
      },
    };
  } catch (cause) {
    const error = getTRPCErrorFromUnknown(cause);

    opts.onError?.({ error, path, input, ctx, type: type, req: opts.req });

    return {
      error: getErrorShape({
        config: opts.router._def._config,
        error,
        type,
        path,
        input,
        ctx,
      }),
    };
  }
}

function caughtErrorToData<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  cause: unknown,
  errorOpts: {
    opts: Pick<
      ResolveHTTPRequestOptions<TRouter, TRequest>,
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
  return {
    error,
    untransformedJSON,
  };
}

/**
 * Since `resolveHTTPResponse` is a public API (community adapters),
 * let's give it a strong type signature to increase discoverability.
 */

/**
 * If the `unstable_stream` option is set to `true`, the body (if any) of the HTTPResponse object will be a
 * readable stream. Otherwise, it will be a string representation of the response body (JSON)
 *
 * In practice, this shouldn't matter - Response bodies (including JSON) are all, in fact, readable streams under
 * the hood. This means that we can send ALL responses as streams, and (with the appropriate response headers) the
 * client will still be able to read the response body by calling `await response.json()` or `await response.text()`.
 *
 * However, to preserve compatibility with any existing code that may be relying on the response body being a string,
 * the type signature for the returned response body will remain a string UNLESS the `unstable_stream` option is set
 * to `true`. It is recommended that you update your code to handle streams, as this may be the default behavior in
 * a future major version.
 */
/**
 * Non-streaming signature for `resolveHTTPResponse`:
 * @param opts.unstable_streaming `undefined`
 * @returns `Promise<HTTPResponse>` - the response body will be a stringified JSON object.
 * @deprecated - this signature will be removed in a future major version, use the streaming signature instead,
 * which returns a response supporting `response.text()` and `response.json()`.
 */
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  opts: Exclude<
    ResolveHTTPRequestOptions<TRouter, TRequest>,
    { unstable_streamSupport: string[] }
  >,
): Promise<HTTPResponse>;
/**
 * Streaming signature for `resolveHTTPResponse`:
 * @param opts.unstable_streaming - set to `true` to enable the experimental streaming behavior.
 * @returns `Promise<StreamableHTTPResponse>` - the response body will be a readable stream, instead of JSON.
 */
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  opts: Extract<
    ResolveHTTPRequestOptions<TRouter, TRequest>,
    { unstable_streamSupport: string[] }
  >,
): Promise<StreamHTTPResponse>;
// implementation
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  opts: ResolveHTTPRequestOptions<TRouter, TRequest>,
): Promise<HTTPResponse | StreamHTTPResponse> {
  const { router, req, unstable_streamSupport } = opts;
  const streamSupport = new Set(unstable_streamSupport);

  if (req.method === 'HEAD') return { status: 204 }; // can be used for lambda warmup

  const contentTypeHandler =
    opts.contentTypeHandler ?? fallbackContentTypeHandler;
  const batchingEnabled = opts.batching?.enabled ?? true;
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined;

  const isBatchCall = !!req.query.get('batch');

  let streamMode: 'json' | 'sse' | 'none' = 'none';
  switch (req.headers['trpc-batch-mode']) {
    case 'stream': // backward compatibility
    case 'stream/json':
      streamMode = 'json';
      break; // JSON streaming
    case 'stream/sse':
      streamMode = 'sse';
      break;
    default:
      streamMode = 'none';
  }

  try {
    // we create context first so that (unless `createContext()` throws)
    // error handler may access context information
    //
    // this way even if the client sends malformed input that might cause an exception:
    //  - `opts.error` has value,
    //  - batching is not enabled,
    //  - `type` is unknown,
    //  - `getInputs` throws because of malformed JSON,
    // context value is still available to the error handler
    ctx = await opts.createContext();

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

    if (streamMode !== 'none' && !streamSupport.has(streamMode)) {
      console.warn('Client requested an unsupported stream mode', {
        streamMode,
        streamSupport: Array.from(streamSupport),
      });
    }

    const inputs = await contentTypeHandler.getInputs({
      isBatchCall,
      req,
      router,
      preprocessedBody: opts.preprocessedBody ?? false,
    });

    paths = isBatchCall
      ? decodeURIComponent(opts.path).split(',')
      : [opts.path];
    const promises = paths.map((path, index) =>
      getRawProcedureResult({ opts, ctx, type, input: inputs[index], path }),
    );

    const response = buildResponse({
      ctx,
      isBatchCall,
      paths,
      promises,
      router,
      streamMode,
      type,
      responseMeta: opts.responseMeta,
      errors: [],
    });

    if (unstable_streamSupport !== undefined) return response;

    const body = await response.text();
    const status = response.status;
    const headers = response.headers;

    return {
      body,
      status,
      headers,
    };
  } catch (cause) {
    // we get here if
    // - batching is called when it's not enabled
    // - `createContext()` throws
    // - `router._def._config.transformer.output.serialize()` throws
    // - post body is too large
    // - input deserialization fails
    // - `errorFormatter` return value is malformed
    const { error, untransformedJSON } = caughtErrorToData(cause, {
      opts,
      ctx,
      type,
    });

    const headResponse = buildResponse({
      ctx,
      paths,
      type,
      responseMeta: opts.responseMeta,
      promises: [Promise.resolve(untransformedJSON)],
      router,
      isBatchCall: false,
      streamMode: 'none',
      errors: [error],
    });

    if (unstable_streamSupport !== undefined) return headResponse;
    
    const body = await headResponse.text();
    const status = headResponse.status;
    const headers = headResponse.headers;

    return {
      body,
      status,
      headers,
    };
  }
}
