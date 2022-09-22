import { TRPCError } from '../../error/TRPCError';
import { ProcedureType } from '../router';

/**
 * @deprecated
 */
export const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};

interface MiddlewareResultBase<TContext> {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: typeof middlewareMarker;
  ctx: TContext;
}

/**
 * @deprecated
 */
interface MiddlewareOKResult<TContext> extends MiddlewareResultBase<TContext> {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @deprecated
 */
interface MiddlewareErrorResult<TContext>
  extends MiddlewareResultBase<TContext> {
  ok: false;
  error: TRPCError;
  // we could guarantee it's always of this type
}

/**
 * @deprecated
 */
export type MiddlewareResult<TContext> =
  | MiddlewareOKResult<TContext>
  | MiddlewareErrorResult<TContext>;

/**
 * @deprecated
 */
export type MiddlewareFunction<TInputContext, TContext, TMeta> = (opts: {
  ctx: TInputContext;
  type: ProcedureType;
  path: string;
  rawInput: unknown;
  meta?: TMeta;
  next: {
    (): Promise<MiddlewareResult<TInputContext>>;
    <TNewContext>(opts: { ctx: TNewContext }): Promise<
      MiddlewareResult<TNewContext>
    >;
  };
}) => Promise<MiddlewareResult<TContext>>;
