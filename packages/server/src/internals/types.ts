import { TRPCError } from '../TRPCError';
import { inferRouterParams } from '../core';
import { ProcedureType } from '../core';
import { AnyRouter } from '../core/router';

/**
 * Base interface for any response handler
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: undefined | inferRouterParams<TRouter>['_ctx'];
}) => void;
