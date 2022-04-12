import { Params } from './utils';
import { ProcedureType } from './utils';
import { MiddlewareMarker } from './utils';

/**
 * @internal
 */
interface MiddlewareResultBase {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: MiddlewareMarker;
}

/**
 * @internal
 */
interface MiddlewareOKResult<_TParams extends Params>
  extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @internal
 */
interface MiddlewareErrorResult<_TParams extends Params>
  extends MiddlewareResultBase {
  ok: false;
  error: Error;
  // we could guarantee it's always of this type
}

/**
 * @internal
 */
export type MiddlewareResult<TParams extends Params> =
  | MiddlewareOKResult<TParams>
  | MiddlewareErrorResult<TParams>;

/**
 * @internal
 */
export type MiddlewareFunction<
  TParams extends Params,
  TParamsAfter extends Params,
> = (opts: {
  ctx: TParams['_ctx_out'];
  type: ProcedureType;
  path: string;
  input: TParams['_input_out'];
  rawInput: unknown;
  meta: TParams['_meta'];
  next: {
    (): Promise<MiddlewareResult<TParams>>;
    <$TContext>(opts: { ctx: $TContext }): Promise<
      MiddlewareResult<{
        _ctx_in: TParams['_ctx_in'];
        _ctx_out: $TContext;
        _input_in: TParams['_input_in'];
        _input_out: TParams['_input_out'];
        _output_in: TParams['_output_in'];
        _output_out: TParams['_output_out'];
        _meta: TParams['_meta'];
      }>
    >;
  };
}) => Promise<MiddlewareResult<TParamsAfter>>;

/**
 * @internal
 */
export function createMiddlewareFactory<TContext, TMeta>() {
  return function createMiddleware<$TNewParams extends Params>(
    fn: MiddlewareFunction<
      {
        _ctx_in: TContext;
        _ctx_out: TContext;
        _input_out: unknown;
        _input_in: unknown;
        _output_in: unknown;
        _output_out: unknown;
        _meta: TMeta;
      },
      $TNewParams
    >,
  ) {
    return fn;
  };
}
