import { ProcedureType } from '../router';
import { TRPCError } from '../TRPCError';

export const middlewareMarker = Symbol('middlewareMarker');
interface MiddlewareResultBase {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: typeof middlewareMarker;
}

interface MiddlewareOKResult extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}
interface MiddlewareErrorResult extends MiddlewareResultBase {
  ok: false;
  error: TRPCError;
  // we could guarantee it's always of this type
}

export type MiddlewareResult = MiddlewareOKResult | MiddlewareErrorResult;

export type MiddlewareFunction<TContext> = (opts: {
  ctx: TContext;
  type: ProcedureType;
  path: string;
  next: () => Promise<MiddlewareResult>;
}) => Promise<MiddlewareResult>;
