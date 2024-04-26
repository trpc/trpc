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
import { transformTRPCResponse } from '../transformer';
import { isObject, memoize, unsetMarker } from '../utils';
import { getBatchStreamFormatter } from './batchStreamFormatter';
import { contentTypeHandlers } from './content-type/contentTypeHandlers';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type {
  HTTPBaseHandlerOptions,
  HTTPHeaders,
  HTTPRequest,
  HTTPResponse,
  ResolveHTTPRequestOptionsContextFn,
} from './types';

function httpHeadersToFetchHeaders(headers: HTTPHeaders): Headers {
  const newHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        newHeaders.append(key, v);
      }
    } else if (typeof value === 'string') {
      newHeaders.set(key, value);
    }
  }
  return newHeaders;
}
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

  const url = new URL(req.url);

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 204,
    });
  }
  const allowBatching = opts.allowBatching ?? opts.batching?.enabled ?? true;
  const allowMethodOverride = opts.allowMethodOverride ?? false;

  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined;

  const isBatchCall = url.searchParams.get('batch') === '1';
  const isStreamCall = req.headers.get('trpc-batch-mode') === 'stream';

  try {
    if (opts.error) {
      throw opts.error;
    }
    if (isBatchCall && !allowBatching) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Batching is not enabled on the server`,
      });
    }
    /* istanbul ignore if -- @preserve */
    if (type === 'subscription') {
      throw new TRPCError({
        message: 'Subscriptions should use wsLink',
        code: 'METHOD_NOT_SUPPORTED',
      });
    }

    paths = isBatchCall
      ? decodeURIComponent(opts.path).split(',')
      : [opts.path];

    // we create context first so that (unless `createContext()` throws)
    // error handler may access context information
    //
    // this way even if the client sends malformed input that might cause an exception:
    //  - `opts.error` has value,
    //  - batching is not enabled,
    //  - `type` is unknown,
    //  - `getInputs` throws because of malformed JSON,
    // context value is still available to the error handler
    ctx = await opts.createContext({
      info: {
        calls: paths.map((path) => ({
          path,
        })),
        isBatchCall,
      },
    });

    const getInputForIndex = (() => {
      // resolve content type handler
      let contentTypeHandler = contentTypeHandlers.list.find((handler) =>
        handler.isMatch(req),
      );

      if (!contentTypeHandler && req.method === 'GET') {
        contentTypeHandler = contentTypeHandlers.fallback;
      }

      if (!contentTypeHandler) {
        const contentType = req.headers.get('content-type');

        throw new TRPCError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: contentType
            ? `Unsupported content-type "${contentType}"`
            : 'Missing content-type header',
        });
      }
      if (isBatchCall && !contentTypeHandler.batching) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Batching is possible with content-type "${req.headers.get(
            'content-type',
          )}"`,
        });
      }
      // memoize get inputs so body is only read once
      const getInputs = memoize(() =>
        contentTypeHandler.getInputs(req, url.searchParams),
      );

      const deserializeInput = (input: unknown) => {
        if (input === undefined || !contentTypeHandler.transform) {
          return input;
        }
        return router._def._config.transformer.input.deserialize(input);
      };

      return (index: number) => {
        let rawInput: unknown = unsetMarker;

        return {
          getRawInput: async () => {
            if (rawInput !== unsetMarker) {
              return rawInput;
            }
            const inputs = await getInputs();

            if (!isBatchCall) {
              rawInput = deserializeInput(inputs);
              return rawInput;
            }

            if (!isObject(inputs)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  '"input" needs to be an object when doing a batch call',
              });
            }

            rawInput = deserializeInput(inputs[index]);
            return rawInput;
          },
          getParsedInput: () => {
            return rawInput === unsetMarker ? undefined : rawInput;
          },
        };
      };
    })();

    const inputsByIndex = paths.map((_, index) => getInputForIndex(index));

    if (isBatchCall && !allowBatching) {
      throw new Error(`Batching is not enabled on the server`);
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
    >[] = paths.map(async (path, index) => {
      const input = inputsByIndex[index]!;
      try {
        const data = await callProcedure({
          procedures: opts.router._def.procedures,
          path,
          getRawInput: input.getRawInput,
          ctx,
          type,
          allowMethodOverride,
        });
        return {
          result: {
            data,
          },
        };
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        errors.push(error);

        opts.onError?.({
          error,
          path,
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
            path,
            input,
            ctx,
          }),
        };
      }
    });
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

      // return body stuff
      const result = isBatchCall ? untransformedJSON : untransformedJSON[0]!;
      const transformedJSON = transformTRPCResponse(
        router._def._config,
        result,
      );
      const body = JSON.stringify(transformedJSON);

      return new Response(body, {
        status: headResponse.status,
        headers: httpHeadersToFetchHeaders(headResponse.headers ?? {}),
      });
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
    let controller: ReadableStreamDefaultController<string> = undefined as any;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
    });
    async function exec() {
      const indexedPromises = new Map(
        promises.map((promise, index) => [
          index,
          promise.then((r) => [index, r] as const),
        ]),
      );
      const formatter = getBatchStreamFormatter();

      while (indexedPromises.size > 0) {
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

          controller.enqueue(formatter(index, body));
        } catch (cause) {
          const path = paths![index];
          const input = inputsByIndex[index]!.getParsedInput();
          const { body } = caughtErrorToData(cause, {
            opts,
            ctx,
            type,
            path,
            input,
          });

          controller.enqueue(formatter(index, body));
        }
      }

      controller.enqueue(formatter.end());
      controller.close();
    }
    exec().catch((err) => {
      controller.error(err);
    });

    return new Response(stream, {
      headers: httpHeadersToFetchHeaders(headResponse.headers ?? {}),
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
      paths,
      type,
      responseMeta: opts.responseMeta,
      untransformedJSON,
      errors: [error],
    });

    return new Response(body, {
      status: headResponse.status,
      headers: httpHeadersToFetchHeaders(headResponse.headers ?? {}),
    });
  }
}
