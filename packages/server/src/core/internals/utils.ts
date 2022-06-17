import { DefaultErrorShape, ErrorFormatter } from '../../error/formatter';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
} from '../../transformer';
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

/**
 * The initial generics that are used in the init function
 * @internal
 */
export interface InitGenerics {
  ctx: Record<string, unknown>;
  meta: Record<string, unknown>;
}
/**
 * The initial params that are used and actually represents real values underneath
 * @internal
 */
export interface InitOptions<T extends InitGenerics> {
  transformer: DataTransformerOptions;
  errorFormatter: ErrorFormatter<T['ctx'], any>;
}

/**
 * @internal
 */
export type CreateInitGenerics<T extends InitGenerics> = T;

/**
 * The config that is resolved after both calls of `initTRPC()` has been called
 * Combination of `InitTOptions` + `InitGenerics`
 * @internal
 */
export interface RootConfig {
  ctx: Record<string, unknown>;
  meta: Record<string, unknown>;
  transformer: CombinedDataTransformer;
  errorShape: DefaultErrorShape;
}

/**
 * @internal
 */
export type CreateRootConfig<T extends RootConfig> = T;
