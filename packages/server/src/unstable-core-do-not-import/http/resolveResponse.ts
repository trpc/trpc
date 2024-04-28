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
import { getBatchStreamFormatter } from './batchStreamFormatter';
import { getContentTypeHandler } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
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
  paths: string[] | undefined;
  type: ProcedureType | 'unknown';
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
  untransformedJSON?:
    | TRPCResponse<unknown, inferRouterError<TRouter>>
    | TRPCResponse<unknown, inferRouterError<TRouter>>[]
    | undefined;
  errors: TRPCError[];
}) {
  const {
    ctx,
    paths,
    type,
    responseMeta,
    untransformedJSON,
    errors = [],
  } = initOpts;

  let status = untransformedJSON ? getHTTPStatusCode(untransformedJSON) : 200;

  const headers = new Headers([['Content-Type', 'application/json']]);

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
  const allowMethodOverride =
    (opts.allowMethodOverride ?? false) && req.method === 'POST';

  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined;

  let isBatchCall = false;
  const isStreamCall = req.headers.get('trpc-batch-mode') === 'stream';

  try {
    const processor = getContentTypeHandler(req).processor({
      req,
      path: opts.path,
      config: router._def._config,
      searchParams: url.searchParams,
    });
    isBatchCall = processor.isBatchCall;
    paths = processor.paths;

    // we create context early so that error handlers may access context information
    ctx = await opts.createContext({
      info: {
        calls: paths.map((path) => ({
          path,
        })),
        isBatchCall,
      },
    });

    if (opts.error) {
      throw opts.error;
    }
    if (isBatchCall && !allowBatching) {
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
    >[] = paths.map(async (path, index) => {
      try {
        const data = await callProcedure({
          procedures: opts.router._def.procedures,
          path,
          getRawInput: async () => processor.getByIndex(index),
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
        const input = processor.resultByIndex(index);

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
        headers: headResponse.headers,
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
      errors: [],
    });

    const encoder = new TextEncoderStream();
    const stream = encoder.readable;
    const controller = encoder.writable.getWriter();
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

          await controller.write(formatter(index, body));
        } catch (cause) {
          const path = paths![index];
          const input = processor.resultByIndex(index);
          const { body } = caughtErrorToData(cause, {
            opts,
            ctx,
            type,
            path,
            input,
          });

          await controller.write(formatter(index, body));
        }
      }

      await controller.write(formatter.end());
      await controller.close();
    }
    exec().catch((err) => controller.abort(err));

    return new Response(stream, {
      headers: headResponse.headers,
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
      headers: headResponse.headers,
    });
  }
}
