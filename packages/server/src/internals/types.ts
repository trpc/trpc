import type { inferRouterContext, ProcedureType } from '../core';
import type { AnyRouter } from '../core/router';
import type { TRPCError } from '../error/TRPCError';

/**
 * Base interface for any response handler
 * @internal
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}

/**
 * @internal
 */
export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: inferRouterContext<TRouter> | undefined;
}) => void;
