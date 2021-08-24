/* eslint-disable @typescript-eslint/no-non-null-assertion */
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { BaseRequest, BaseResponse } from '../internals/BaseHandlerOptions';
import { callProcedure } from '../internals/callProcedure';
import { getErrorFromUnknown } from '../internals/errors';
import { transformTRPCResponse } from '../internals/transformTRPCResponse';
import {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../router';
import { TRPCErrorResponse, TRPCResponse, TRPCResultResponse } from '../rpc';
import { TRPCError } from '../TRPCError';
import { getHTTPStatusCode } from './internals/getHTTPStatusCode';
import { getPostBody } from './internals/getPostBody';
import { getQueryInput } from './internals/getQueryInput';
import { HTTPHandlerOptions } from './internals/HTTPHandlerOptions';

assertNotBrowser();

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TRouter extends AnyRouter, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

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
async function getRequestParams({
  req,
  type,
  maxBodySize,
}: {
  req: BaseRequest;
  type: ProcedureType;
  maxBodySize: number | undefined;
}): Promise<{
  input: unknown;
}> {
  if (type === 'query') {
    const query = req.query ? req.query : url.parse(req.url!, true).query;
    const input = getQueryInput(query);
    return { input };
  }

  const body = await getPostBody({ req, maxBodySize });

  return { input: body };
}

export async function requestHandler<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
>(
  opts: {
    req: TRequest;
    res: TResponse;
    path: string;
  } & HTTPHandlerOptions<TRouter, TRequest, TResponse>,
) {
  const { req, res, createContext, teardown, onError, maxBodySize, router } =
    opts;
  const batchingEnabled = opts.batching?.enabled ?? true;
  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    res.statusCode = 204;
    res.end();
    return;
  }
  const type =
    HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? ('unknown' as const);
  let ctx: inferRouterContext<TRouter> | undefined = undefined;
  let paths: string[] | undefined = undefined;

  const reqQueryParams = req.query
    ? req.query
    : url.parse(req.url!, true).query;
  const isBatchCall = reqQueryParams.batch;
  type TRouterError = inferRouterError<TRouter>;
  type TRouterResponse = TRPCResponse<unknown, TRouterError>;

  function endResponse(
    untransformedJSON: TRouterResponse | TRouterResponse[],
    errors: TRPCError[],
  ) {
    if (!res.statusCode || res.statusCode === 200) {
      // only override statusCode if not already set
      // node defaults to be `200` in the `http` package
      res.statusCode = getHTTPStatusCode(untransformedJSON);
    }

    res.setHeader('Content-Type', 'application/json');

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
      if (typeof value !== 'string') {
        continue;
      }

      res.setHeader(key, value);
    }
    if (meta.status) {
      res.statusCode = meta.status;
    }

    const transformedJSON = transformTRPCResponse(router, untransformedJSON);

    res.end(JSON.stringify(transformedJSON));
  }

  try {
    if (isBatchCall && !batchingEnabled) {
      throw new Error(`Batching is not enabled on the server`);
    }
    if (type === 'unknown' || type === 'subscription') {
      throw new TRPCError({
        message: `Unexpected request method ${req.method}`,
        code: 'METHOD_NOT_SUPPORTED',
      });
    }
    const { input: rawInput } = await getRequestParams({
      maxBodySize,
      req,
      type,
    });

    paths = isBatchCall ? opts.path.split(',') : [opts.path];
    ctx = await createContext?.({ req, res });

    const deserializeInputValue = (rawValue: unknown) => {
      return typeof rawValue !== 'undefined'
        ? router._def.transformer.input.deserialize(rawValue)
        : rawValue;
    };
    const getInputs = (): Record<number, unknown> => {
      if (!isBatchCall) {
        return {
          0: deserializeInputValue(rawInput),
        };
      }

      if (
        rawInput == null ||
        typeof rawInput !== 'object' ||
        Array.isArray(rawInput)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }
      const input: Record<number, unknown> = {};
      for (const key in rawInput) {
        const k = key as any as number;
        const rawValue = (rawInput as any)[k];

        const value = deserializeInputValue(rawValue);

        input[k] = value;
      }
      return input;
    };
    const inputs = getInputs();
    const rawResults = await Promise.all(
      paths.map(async (path, index) => {
        const input = inputs[index];
        try {
          const output = await callProcedure({
            ctx,
            router,
            path,
            input,
            type,
          });
          return {
            input,
            path,
            data: output,
          };
        } catch (_err) {
          const error = getErrorFromUnknown(_err);

          onError?.({ error, path, input, ctx, type: type, req });
          return {
            input,
            path,
            error,
          };
        }
      }),
    );
    const errors = rawResults.flatMap((obj) => (obj.error ? [obj.error] : []));
    const resultEnvelopes = rawResults.map((obj) => {
      const { path, input } = obj;

      if (obj.error) {
        const json: TRPCErrorResponse<TRouterError> = {
          id: null,
          error: router.getErrorShape({
            error: obj.error,
            type,
            path,
            input,
            ctx,
          }),
        };
        return json;
      } else {
        const json: TRPCResultResponse<unknown> = {
          id: null,
          result: {
            type: 'data',
            data: obj.data,
          },
        };
        return json;
      }
    });

    const result = isBatchCall ? resultEnvelopes : resultEnvelopes[0];
    endResponse(result, errors);
  } catch (_err) {
    // we get here if
    // - batching is called when it's not enabled
    // - `createContext()` throws
    // - post body is too large
    // - input deserialization fails
    const error = getErrorFromUnknown(_err);

    const json: TRPCErrorResponse<TRouterError> = {
      id: null,
      error: router.getErrorShape({
        error,
        type,
        path: undefined,
        input: undefined,
        ctx,
      }),
    };
    onError?.({
      error,
      path: undefined,
      input: undefined,
      ctx,
      type: type,
      req,
    });
    endResponse(json, [error]);
  }
  await teardown?.();
}
