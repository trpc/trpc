import { ProcedureParams } from '../procedure';

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
export const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};

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
export interface ResolveOptions<TParams extends ProcedureParams> {
  ctx: TParams['_ctx_out'];
  input: TParams['_input_out'];
}

/**
 * @internal
 */
export type ValidateShape<TActualShape, TExpectedShape> =
  TActualShape extends TExpectedShape
    ? Exclude<keyof TActualShape, keyof TExpectedShape> extends never
      ? TActualShape
      : TExpectedShape
    : never;

/**
 * @internal
 */
export type PickFirstDefined<T, K> = undefined extends T
  ? undefined extends K
    ? never
    : K
  : T;

export type EnsureRecord<T> = T extends Record<string, any>
  ? T
  : Record<string, never>;
