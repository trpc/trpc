/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createNodeHttpFormDataDecoder } from '../adapters/node-http/content-decoder/form-data';
import { createNodeHttpJsonContentDecoder } from '../adapters/node-http/content-decoder/json';
import {
  AnyRouter,
  ContentDecoder,
  ProcedureType,
  callProcedure,
  inferRouterContext,
  inferRouterError,
} from '../core';
import { RequestUtils } from '../core/internals/procedureBuilder';
import { TRPCError, getTRPCErrorFromUnknown } from '../error/TRPCError';
import { TRPCResponse } from '../rpc';
import { transformTRPCResponse } from '../shared';
import { Maybe } from '../types';
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

const fallbackContentDecoder = createNodeHttpJsonContentDecoder();
const contentDecoders = [
  fallbackContentDecoder,
  // TODO: probably while experimental this should be added manually by users, but should be here eventually
  createNodeHttpFormDataDecoder(),
];

interface ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
> extends HTTPBaseHandlerOptions<TRouter, TRequest> {
  createContext: () => Promise<inferRouterContext<TRouter>>;
  req: TRequest;
  path: string;
  error?: Maybe<TRPCError>;
  customContentDecoders?: ContentDecoder[];
  preprocessedBody?: boolean;
  requestUtils: RequestUtils;
}

export async function resolveHTTPResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(opts: ResolveHTTPRequestOptions<TRouter, TRequest>): Promise<HTTPResponse> {
  const { router, req } = opts;

  const contentDecoder: ContentDecoder =
    opts.customContentDecoders?.find((handler) => handler.isMatch(req)) ??
    contentDecoders.find((handler) => handler.isMatch(req)) ??
    fallbackContentDecoder;

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

    const transformedJSON = transformTRPCResponse(router, untransformedJSON);

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

    // TODO: this could probably be moved into a stateful class somewhere?
    //
    // Decoder Cache

    const nonDecodedMarker = Symbol('NOT_DECODED');
    let decodedInput: unknown = nonDecodedMarker;
    function syncMaybeGetDecodedInput(batchElement: number) {
      if (decodedInput === nonDecodedMarker) {
        return undefined;
      }
      return (decodedInput as Record<number, unknown>)[batchElement];
    }

    async function decodeInput(batchElement: number) {
      if (decodedInput === nonDecodedMarker) {
        decodedInput = await contentDecoder.decodeInput({
          isBatchCall,
          req,
          router,
          preprocessedBody: opts.preprocessedBody ?? false,
          utils: opts.requestUtils,
        });
      }

      return (decodedInput as Record<number, unknown>)[batchElement];
    }

    //
    // Call Procedure

    paths = isBatchCall ? opts.path.split(',') : [opts.path];
    ctx = await opts.createContext();

    const rawResults = await Promise.all(
      paths.map(async (path, index) => {
        try {
          const output = await callProcedure({
            procedures: router._def.procedures,
            path,
            async decodeInput() {
              return await decodeInput(index);
            },
            ctx,
            type,
          });

          return {
            // TODO: maybe this only gets populated if it was decoded already? If not decoded then remains undefined?
            input: syncMaybeGetDecodedInput(index),
            path,
            data: output,
          };
        } catch (cause) {
          const input = syncMaybeGetDecodedInput(index);
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
          error: router.getErrorShape({
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
        error: router.getErrorShape({
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
