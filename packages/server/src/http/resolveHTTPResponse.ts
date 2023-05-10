/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AnyRouter,
  ProcedureType,
  callProcedure,
  inferRouterContext,
  inferRouterError,
} from "../core";
import { TRPCError, getTRPCErrorFromUnknown } from "../error/TRPCError";
import { TRPCResponse } from "../rpc";
import { transformTRPCResponse } from "../shared";
import { Maybe } from "../types";
import {
  BaseContentTypeHandler,
  getJsonContentTypeInputs,
} from "./contentType";
import { getHTTPStatusCode } from "./getHTTPStatusCode";
import { HTTPHeaders, HTTPResponse } from "./internals/types";
import { HTTPBaseHandlerOptions, HTTPRequest } from "./types";

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: "query",
  POST: "mutation",
};

type ResponseChunk = [number, string]

const fallbackContentTypeHandler = {
  getInputs: getJsonContentTypeInputs,
};

interface ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest
> extends HTTPBaseHandlerOptions<TRouter, TRequest> {
  createContext: () => Promise<inferRouterContext<TRouter>>;
  req: TRequest;
  path: string;
  error?: Maybe<TRPCError>;
  contentTypeHandler?: BaseContentTypeHandler<any>;
  preprocessedBody?: boolean;
}

export async function* resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest
>(opts: ResolveHTTPRequestOptions<TRouter, TRequest>) {
  const { router, req } = opts;
  const contentTypeHandler =
    opts.contentTypeHandler ?? fallbackContentTypeHandler;

  const batchingEnabled = opts.batching?.enabled ?? true;
  const streamingEnabled = opts.streaming?.enabled ?? true;
  if (req.method === "HEAD") {
    // can be used for lambda warmup
    const headResponse: HTTPResponse = {
      status: 204,
    };
    yield headResponse;
  }
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method] ?? ("unknown" as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined = undefined;

  const isStreamCall = !!req.query.get("stream");
  const isBatchCall = isStreamCall || !!req.query.get("batch");
  type TRouterError = inferRouterError<TRouter>;
  type TRouterResponse = TRPCResponse<unknown, TRouterError>;

  function initResponse(earlyErrors: TRPCError[]): HTTPResponse {
    let status = 200;
    const headers: HTTPHeaders = {
      "Content-Type": "application/json",
    };

    const meta =
      opts.responseMeta?.({
        ctx,
        paths,
        type,
        errors: earlyErrors,
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
      count: paths!.length,
    };
  }

  try {
    if (opts.error) {
      throw opts.error;
    }
    if (isStreamCall && !streamingEnabled) {
      throw new Error(`Streaming is not enabled on the server`);
    }
    if (isBatchCall && !batchingEnabled) {
      throw new Error(`Batching is not enabled on the server`);
    }
    /* istanbul ignore if -- @preserve */
    if (type === "subscription") {
      throw new TRPCError({
        message: "Subscriptions should use wsLink",
        code: "METHOD_NOT_SUPPORTED",
      });
    }
    if (type === "unknown") {
      throw new TRPCError({
        message: `Unexpected request method ${req.method}`,
        code: "METHOD_NOT_SUPPORTED",
      });
    }

    const inputs = await contentTypeHandler.getInputs({
      isBatchCall,
      req,
      router,
      preprocessedBody: opts.preprocessedBody ?? false,
    });

    paths = isBatchCall ? opts.path.split(",") : [opts.path];
    ctx = await opts.createContext();

    yield initResponse([]);

    let resolveSingleInput: ([index, r]: [number, TRouterResponse]) => void;
    paths.forEach(async (path, index) => {
      const input = inputs[index];
      try {
        const data = await callProcedure({
          procedures: router._def.procedures,
          path,
          rawInput: input,
          ctx,
          type,
        });
        resolveSingleInput([
          index,
          {
            result: {
              data,
            },
          },
        ]);
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);

        opts.onError?.({ error, path, input, ctx, type: type, req });

        resolveSingleInput([
          index,
          {
            error: router.getErrorShape({
              error,
              type,
              path,
              input,
              ctx,
            }),
          },
        ]);
      }
    });
    for (let i = 0; i < paths.length - 1; i++) {
      const [index, untransformedJSON] = await new Promise<
        [number, TRouterResponse]
      >((resolve) => (resolveSingleInput = resolve));
      const transformedJSON = transformTRPCResponse(router, untransformedJSON);
      const body = JSON.stringify(transformedJSON);
      const chunk: ResponseChunk = [index, body]
      yield chunk;
    }
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

    yield initResponse([error]);

    const untransformedJSON = {
      error: router.getErrorShape({
        error,
        type,
        path: undefined,
        input: undefined,
        ctx,
      }),
    };
    const transformedJSON = transformTRPCResponse(router, untransformedJSON);
    const body = JSON.stringify(transformedJSON);
    const chunk: ResponseChunk = [-1, body];
    return chunk;
  }
}
