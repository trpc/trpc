import type { AnyRootTypes, RootConfig } from './rootConfig';

/**
 * Result of `initTRPC.create()`
 */
type InitLike = {
  _config: RootConfig<AnyRootTypes>;
};

/**
 * Result of `initTRPC.create().router()`
 */
type RouterLike = {
  _def: InitLike;
};

/**
 * Result of `initTRPC.create()._config`
 */
type RootConfigLike = {
  $types: AnyRootTypes;
};
/**
 * Anything that can be inferred to the root config types
 */
export type TRPCInferrable =
  | RouterLike
  | InitLike
  | RootConfigLike
  | AnyRootTypes;

export type inferRootTypes<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRootTypes
    ? TInferrable
    : TInferrable extends RootConfigLike
    ? TInferrable['$types']
    : TInferrable extends InitLike
    ? TInferrable['_config']['$types']
    : TInferrable extends RouterLike
    ? TInferrable['_def']['_config']['$types']
    : never;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferRootTypes<TInferrable>['errorShape'];
