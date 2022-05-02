export type ProcedureType = 'query' | 'mutation' | 'subscription';

/**
 * @internal
 */
export type Overwrite<T, U> = Omit<T, keyof U> & U;
/**
 * @internal
 */
export type DefaultValue<TValue, TFallback> = UnsetMarker extends TValue
  ? TFallback
  : TValue;

/**
 * @internal
 */
export const middlewareMarker = Symbol('middlewareMarker');
/**
 * @internal
 */
export type MiddlewareMarker = typeof middlewareMarker;

/**
 * @internal
 */
export const unsetMarker = Symbol('unsetMarker');
/**
 * @internal
 */
export type UnsetMarker = typeof unsetMarker;

/**
 * @internal
 */
export const procedureMarker = Symbol('procedureMarker');
/**
 * @internal
 */
export type ProcedureMarker = typeof procedureMarker;

/**
 * @internal
 */
export interface Params<
  TContextIn = unknown,
  TContextOut = unknown,
  TInputIn = unknown,
  TInputOut = unknown,
  TOutputIn = unknown,
  TOutputOut = unknown,
  TMeta = unknown,
> {
  /**
   * @internal
   */
  _meta: TMeta;
  /**
   * @internal
   */
  _ctx_in: TContextIn;
  /**
   * @internal
   */
  _ctx_out: TContextOut;
  /**
   * @internal
   */
  _output_in: TOutputIn;
  /**
   * @internal
   */
  _output_out: TOutputOut;
  /**
   * @internal
   */
  _input_in: TInputIn;
  /**
   * @internal
   */
  _input_out: TInputOut;
}

/**
 * @internal
 */
export interface ResolveOptions<TParams extends Params> {
  ctx: TParams['_ctx_out'];
  input: TParams['_input_out'];
}
