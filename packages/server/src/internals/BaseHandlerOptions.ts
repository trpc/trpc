import http from 'http';
import qs from 'qs';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';
import { TRPCError } from '../TRPCError';

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: undefined | inferRouterContext<TRouter>;
}) => void;
/**
 * Base interface for any HTTP/WSS handlers
 */
export interface BaseHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
> {
  teardown?: () => Promise<void>;
  maxBodySize?: number;
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}
