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

export interface MiddlewareFunctionOptionsBase<TContext> {
  ctx: TContext;
  type: ProcedureType;
  path: string;
}

export interface MiddlewareFunctionKeepContextOptions<TContext>
  extends MiddlewareFunctionOptionsBase<TContext> {
  next: Promise<MiddlewareResult<TContext>>;
}
export interface NextWithContextOptions<TNewContext> {
  ctx: TNewContext;
}
export interface MiddlewareFunctionNewContextOptions<TContext, TNewContext>
  extends MiddlewareFunctionOptionsBase<TContext> {
  next: (
    opts: NextWithContextOptions<TNewContext>,
  ) => Promise<MiddlewareResult<TNewContext>>;
}

export type MiddlewareFunctionKeepContext<TContext> = (opts: {
  ctx: TContext;
  type: ProcedureType;
  path: string;
  next: () => Promise<MiddlewareResult<TContext>>;
}) => Promise<MiddlewareResult<TContext>>;

export type MiddlewareFunctionWithNewContext<TContext, TNewContext> = (opts: {
  ctx: TContext;
  type: ProcedureType;
  path: string;
  next: (opts: { ctx: TNewContext }) => Promise<MiddlewareResult<TNewContext>>;
}) => Promise<MiddlewareResult<TNewContext>>;
