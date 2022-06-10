import { TRPCError } from '../TRPCError';
import { inferRouterParams } from '../core';
import { ProcedureType } from '../core';
import { AnyRouter } from '../core/router';

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: undefined | inferRouterParams<TRouter>['_ctx'];
}) => void;
