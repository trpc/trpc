import http from 'http';
import qs from 'qs';
import { TRPCError } from '../errors';
import { AnyRouter, inferRouterContext, ProcedureType } from '../router';

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

/**
 * Base interface for any HTTP/WSS handlers
 */
export interface BaseHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
> {
  teardown?: () => Promise<void>;
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
  router: TRouter;
}
