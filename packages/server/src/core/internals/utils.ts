import { Simplify } from '../../types';
import { ProcedureParams } from '../procedure';
import { Merge } from './vendor/type-fest/merge';

/**
 * @internal
 * Overwrite properties in `TType` with properties in `TWith`
 * Only overwrites properties when the type to be overwritten
 * is an object. Otherwise it will just use the type from `TWith`.
 */
export type Overwrite<TType, TWith> = TType extends object
  ? TWith extends object
    ? Merge<TType, TWith>
    : TWith
  : TWith;
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
export interface ResolveOptions<TParams extends ProcedureParams> {
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
