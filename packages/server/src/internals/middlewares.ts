import { ProcedureType } from '../router';
import { TRPCError } from '../TRPCError';

export const middlewareMarker = Symbol('middlewareMarker');
interface MiddlewareResultBase<TContext> {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: typeof middlewareMarker;
  ctx: TContext;
}

interface MiddlewareOKResult<TContext> extends MiddlewareResultBase<TContext> {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}
interface MiddlewareErrorResult<TContext>
  extends MiddlewareResultBase<TContext> {
  ok: false;
  error: TRPCError;
  // we could guarantee it's always of this type
}

export type MiddlewareResult<TContext> =
  | MiddlewareOKResult<TContext>
  | MiddlewareErrorResult<TContext>;

export type MiddlewareFunction<TInputContext, TContext> = (opts: {
  ctx: TInputContext;
  type: ProcedureType;
  path: string;
  rawInput: unknown;
  next: {
    (): Promise<MiddlewareResult<TInputContext>>;
    <T>(opts: { ctx: T }): Promise<MiddlewareResult<T>>;
  };
}) => Promise<MiddlewareResult<TContext>>;
