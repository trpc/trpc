/* eslint-disable @typescript-eslint/no-non-null-assertion */
import url from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import { getErrorFromUnknown } from '../internals/errors';
import { TRPCError } from '../TRPCError';
import { callProcedure } from '../internals/callProcedure';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { TRPCErrorResponse, TRPCResponse } from '../rpc';
import {
  BaseRequest,
  BaseResponse,
  BaseHandlerOptions,
} from '../internals/BaseHandlerOptions';
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
  /**
   * @deprecated TODO delete me for next major
   * */
  if (
    body &&
    typeof body === 'object' &&
    'input' in body &&
    Object.keys(body).length === 1
  ) {
    // legacy format
    return { input: body.input };
  }

  return { input: body };
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
    createContext: TCreateContextFn;
  } & BaseHandlerOptions<TRouter, TRequest>,
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
  let input: unknown = undefined;
  let ctx: inferRouterContext<TRouter> | undefined = undefined;

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

    input =
      rawInput !== undefined
        ? router._def.transformer.input.deserialize(rawInput)
        : undefined;
    ctx = await createContext?.({ req, res });

    const getInputs = (): unknown[] | Record<number, unknown> => {
      if (!isBatchCall) {
        return [input];
      }

      // TODO - next major, delete `Array.isArray()`
      if (
        !Array.isArray(input) &&
        (typeof input !== 'object' || input == null)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            '"input" needs to be an array or object when doing a batch call',
        });
      }
      return input as any;
    };
    const inputs = getInputs();
    const paths = isBatchCall ? opts.path.split(',') : [opts.path];
    const results = await Promise.all(
      paths.map(async (path, index) => {
        const id = null;
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
              data: router._def.transformer.output.serialize(output),
            },
          };
          return json;
        } catch (_err) {
          const error = getErrorFromUnknown(_err);

          const json: TRPCErrorResponse = {
            id,
            error: router._def.transformer.output.serialize(
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
      error: router._def.transformer.output.serialize(
        router.getErrorShape({ error, type, path: undefined, input, ctx }),
      ),
    };
    endResponse(json);
    onError?.({ error, path: undefined, input, ctx, type: type, req });
  }
  await teardown?.();
}
