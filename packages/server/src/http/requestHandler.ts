/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { getErrorFromUnknown, TRPCError } from '../errors';
import { callProcedure } from '../internals/callProcedure';
import { deprecateTransformWarning } from '../internals/once';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { TRPCErrorResponse, TRPCResponse } from '../rpc';
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
  const { req, res, createContext, teardown, onError, maxBodySize } = opts;
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
    res.statusCode = getHTTPStatusCode(json, router._def.transformer);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(json));
  }
  try {
    if (isBatchCall && !opts.batching?.enabled) {
      throw new Error(`Batching is not enabled on the server`);
    }
    if (type === 'unknown' || type === 'subscription') {
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
    const query = req.query ? req.query : url.parse(req.url!, true).query;
    const ids =
      typeof query.id === 'string' ? query.id.split(',').map(Number) : [];

    const results = await Promise.all(
      paths.map(async (path, index) => {
        const id = isNaN(ids[index]) ? -1 : ids[index];
        try {
          const output = await callProcedure({
            ctx,
            router,
            path,
            input: inputs[index],
            type,
          });
          const json: TRPCResponse = {
            id,
            result: {
              type: 'data',
              data: router._def.transformer.serialize(output),
            },
          };
          return json;
        } catch (_err) {
          const error = getErrorFromUnknown(_err);

          const json: TRPCErrorResponse = {
            id,
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
