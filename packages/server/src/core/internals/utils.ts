import { Simplify } from '../../types';
import { AnyProcedureParams, ProcedureParams } from '../procedure';

/**
 * @internal
 */
export type Overwrite<TType, TWith> = TType extends any
  ? TWith extends any
    ? {
        [K in keyof TType | keyof TWith]: K extends keyof TWith
          ? TWith[K]
          : K extends keyof TType
          ? TType[K]
          : never;
      }
    : never
  : never;
/**
 * @internal
 */
export type OverwriteKnown<TType, TWith> = {
  [K in keyof TType]: K extends keyof TWith ? TWith[K] : TType[K];
};
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
export interface ResolveOptions<
  TParams extends ProcedureParams<AnyProcedureParams>,
> {
  ctx: Simplify<
    Overwrite<TParams['_config']['$types']['ctx'], TParams['_ctx_out']>
  >;
  input: TParams['_input_out'] extends UnsetMarker
    ? undefined
    : TParams['_input_out'];
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
export type PickFirstDefined<TType, TPick> = undefined extends TType
  ? undefined extends TPick
    ? never
    : TPick
  : TType;

/**
 * @internal
 * Returns the raw input type of a procedure
 */
export type GetRawValueFn = () => Promise<unknown>;
