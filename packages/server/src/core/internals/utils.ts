import { Simplify, WithoutIndexSignature } from '../../types';
import { ProcedureParams } from '../procedure';

/**
 * @internal
 * Overwrite properties in `TType` with properties in `TWith`
 * Only overwrites properties when the type to be overwritten
 * is an object. Otherwise it will just use the type from `TWith`.
 */
export type Overwrite<TType, TWith> = TWith extends any
  ? TType extends object
    ? {
        [K in  // Exclude index signature from keys
          | keyof WithoutIndexSignature<TType>
          | keyof WithoutIndexSignature<TWith>]: K extends keyof TWith
          ? TWith[K]
          : K extends keyof TType
          ? TType[K]
          : never;
      } & (string extends keyof TWith // Handle cases with an index signature
        ? { [key: string]: TWith[string] }
        : number extends keyof TWith
        ? { [key: number]: TWith[number] }
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {})
    : TWith
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
