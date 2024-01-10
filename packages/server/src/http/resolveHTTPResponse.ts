import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../core';
import { callProcedure } from '../core';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { TRPCResponse } from '../rpc';
import { getErrorShape } from '../shared/getErrorShape';
import { transformTRPCResponse } from '../shared/transformTRPCResponse';
import type { Maybe } from '../types';
import type { BaseContentTypeHandler } from './contentType';
import { getJsonContentTypeInputs } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type {
  HTTPHeaders,
  HTTPResponse,
  ResponseChunk,
} from './internals/types';
import type { HTTPBaseHandlerOptions, HTTPRequest } from './types';

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

type PartialBy<TBaseType, TKey extends keyof TBaseType> = Omit<
  TBaseType,
  TKey
> &
  Partial<Pick<TBaseType, TKey>>;

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
  /**
   * Called as soon as the response head is known.
   * When streaming, headers will have been generated
   * **without** knowing the response body.
   *
   * Without this callback, streaming is disabled.
   */
  unstable_onHead: (
    headResponse: Omit<HTTPResponse, 'body'>,
    isStreaming: boolean,
  ) => void;
  /**
   * Called for every procedure with `[index, result]`.
   *
   * Will be called a single time with `index = -1` if
   * - response is an error
   * - response is empty (HEAD request)
   *
   * Without this callback, streaming is disabled.
   */
  unstable_onChunk: (chunk: ResponseChunk) => void;
}

function initResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(initOpts: {
  ctx: inferRouterContext<TRouter> | undefined;
  paths: string[] | undefined;
  type: ProcedureType | 'unknown';
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
  untransformedJSON?:
    | TRPCResponse<unknown, inferRouterError<TRouter>>
    | TRPCResponse<unknown, inferRouterError<TRouter>>[]
    | undefined;
  errors?: TRPCError[];
}): HTTPResponse {
  const {
    ctx,
    paths,
    type,
    responseMeta,
    untransformedJSON,
    errors = [],
  } = initOpts;

  let status = untransformedJSON ? getHTTPStatusCode(untransformedJSON) : 200;
  const headers: HTTPHeaders = {
    'Content-Type': 'application/json',
  };

  const eagerGeneration = !untransformedJSON;
  const data = eagerGeneration
    ? []
    : Array.isArray(untransformedJSON)
    ? untransformedJSON
    : [untransformedJSON];

  const meta =
    responseMeta?.({
      ctx,
      paths,
      type,
      data,
      errors,
      eagerGeneration,
    }) ?? {};

  for (const [key, value] of Object.entries(meta.headers ?? {})) {
    headers[key] = value;
  }
  if (meta.status) {
    status = meta.status;
  }

  return {
    status,
    headers,
  };
}

async function inputToProcedureCall<
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
 * Since `resolveHTTPResponse` is a public API (community adapters),
 * let's give it a strong type signature to increase discoverability.
 */

/**
 * Non-streaming signature for `resolveHTTPResponse`:
 * @param opts.unstable_onHead `undefined`
 * @param opts.unstable_onChunk `undefined`
 * @returns `Promise<HTTPResponse>`
 */
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  opts: Omit<
    ResolveHTTPRequestOptions<TRouter, TRequest>,
    'unstable_onChunk' | 'unstable_onHead'
  >,
): Promise<HTTPResponse>;
/**
 * Streaming signature for `resolveHTTPResponse`:
 * @param opts.unstable_onHead called as soon as the response head is known
 * @param opts.unstable_onChunk called for every procedure with `[index, result]`
 * @returns `Promise<void>` since the response is streamed
 */
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(opts: ResolveHTTPRequestOptions<TRouter, TRequest>): Promise<void>;
// implementation
export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(
  opts: PartialBy<
    ResolveHTTPRequestOptions<TRouter, TRequest>,
    'unstable_onChunk' | 'unstable_onHead'
  >,
): Promise<HTTPResponse | void> {
  const { router, req, unstable_onHead, unstable_onChunk } = opts;

  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    const headResponse: HTTPResponse = {
      status: 204,
    };
    unstable_onHead?.(headResponse, false);
    unstable_onChunk?.([-1, '']);
    return headResponse;
  }
  const contentTypeHandler =
    opts.contentTypeHandler ?? fallbackContentTypeHandler;
  const batchingEnabled = opts.batching?.enabled ?? true;
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined;

  const isBatchCall = !!req.query.get('batch');
  const isStreamCall =
    isBatchCall &&
    unstable_onHead &&
    unstable_onChunk &&
    req.headers['trpc-batch-mode'] === 'stream';

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
      inputToProcedureCall({ opts, ctx, type, input: inputs[index], path }),
    );

    if (!isStreamCall) {
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
        paths,
        type,
        responseMeta: opts.responseMeta,
        untransformedJSON,
        errors,
      });
      unstable_onHead?.(headResponse, false);

      // return body stuff
      const result = isBatchCall ? untransformedJSON : untransformedJSON[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- `untransformedJSON` should be the length of `paths` which should be at least 1 otherwise there wouldn't be a request at all
      const transformedJSON = transformTRPCResponse(
        router._def._config,
        result,
      );
      const body = JSON.stringify(transformedJSON);
      unstable_onChunk?.([-1, body]);

      return {
        status: headResponse.status,
        headers: headResponse.headers,
        body,
      };
    }

    /**
     * Streaming response:
     * - block on none, call `onChunk` as soon as each response is ready
     * - create headers with minimal data (cannot know the response body in advance)
     * - return void
     */
    const headResponse = initResponse({
      ctx,
      paths,
      type,
      responseMeta: opts.responseMeta,
    });
    unstable_onHead(headResponse, true);

    const indexedPromises = new Map(
      promises.map((promise, index) => [
        index,
        promise.then((r) => [index, r] as const),
      ]),
    );
    for (const _ of paths) {
      const [index, untransformedJSON] = await Promise.race(
        indexedPromises.values(),
      );
      indexedPromises.delete(index);

      try {
        const transformedJSON = transformTRPCResponse(
          router._def._config,
          untransformedJSON,
        );
        const body = JSON.stringify(transformedJSON);

        unstable_onChunk([index, body]);
      } catch (cause) {
        const path = paths[index];
        const input = inputs[index];
        const { body } = caughtErrorToData(cause, {
          opts,
          ctx,
          type,
          path,
          input,
        });

        unstable_onChunk([index, body]);
      }
    }
    return;
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
      paths,
      type,
      responseMeta: opts.responseMeta,
      untransformedJSON,
      errors: [error],
    });
    unstable_onHead?.(headResponse, false);

    unstable_onChunk?.([-1, body]);

    return {
      status: headResponse.status,
      headers: headResponse.headers,
      body,
    };
  }
}
