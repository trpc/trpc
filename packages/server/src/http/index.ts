/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import qs from 'qs';
import { assertNotBrowser } from '../assertNotBrowser';
import { inputValidationError, TRPCError } from '../errors';
export * from './errors';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { DataTransformerOptions } from '../transformer';
export * from './requestHandler';
assertNotBrowser();

export type HTTPSuccessResponseEnvelope<TOutput> = {
  ok: true;
  statusCode: number;
  data: TOutput;
};

export type HTTPErrorResponseEnvelope<TRouter extends AnyRouter> = {
  ok: false;
  statusCode: number;
  error: ReturnType<TRouter['_def']['errorFormatter']>;
};

export type HTTPResponseEnvelope<TOutput, TRouter extends AnyRouter> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope<TRouter>;

export function getQueryInput(query: qs.ParsedQs) {
  const queryInput = query.input;
  if (!queryInput) {
    return undefined;
  }
  try {
    return JSON.parse(queryInput as string);
  } catch (err) {
    throw inputValidationError('Expected query.input to be a JSON string');
  }
}

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
  subscriptions?: {
    /**
     * Time in milliseconds before `408` is sent
     */
    requestTimeoutMs?: number;
    /**
     * Allow for some backpressure and batch send events every X ms
     */
    backpressureMs?: number;
  };
  teardown?: () => Promise<void>;
  /**
   * Optional transformer too serialize/deserialize input args + data
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
}
