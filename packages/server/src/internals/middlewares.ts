import { ProcedureType } from '../router';

export const middlewareMarker = Symbol('middlewareMarker');
interface MiddlewareResult {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: typeof middlewareMarker;
  output: unknown;
}

export type MiddlewareFunction<TContext> = (opts: {
  ctx: TContext;
  type: ProcedureType;
  path: string;
  next: () => Promise<MiddlewareResult>;
}) => Promise<MiddlewareResult>;
