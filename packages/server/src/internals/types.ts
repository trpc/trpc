import { inferRouterParams } from '../core';
import { ProcedureType } from '../core';
import { AnyRouter } from '../core/router';
import { TRPCError } from '../error/TRPCError';

/**
 * Base interface for any response handler
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  router: TRouter;
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  methodOverride?: {
    enabled: boolean;
  };
}

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: undefined | inferRouterParams<TRouter>['_ctx'];
}) => void;
