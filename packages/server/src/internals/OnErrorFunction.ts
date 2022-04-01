import { TRPCError } from '../TRPCError';
import { AnyRouter, ProcedureType, inferRouterContext } from '../router';

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: undefined | inferRouterContext<TRouter>;
}) => void;
