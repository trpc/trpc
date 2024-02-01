import type { AnyRootTypes } from './rootConfig';

type ClientTypes = Pick<AnyRootTypes, 'errorShape' | 'transformer'>;

/**
 * Result of `initTRPC.create()`
 */
type InitLike = {
  _config: {
    $types: ClientTypes;
  };
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
  $types: ClientTypes;
};
/**
 * Anything that can be inferred to the root config types needed for a TRPC client
 */
export type TRPCInferrable =
  | RouterLike
  | InitLike
  | RootConfigLike
  | ClientTypes;

export type inferRootTypes<TInferrable extends TRPCInferrable> =
  TInferrable extends ClientTypes
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
