import type { AnyRootTypes } from '../rootConfig';

export type AnyClientTypes = Pick<AnyRootTypes, 'errorShape' | 'transformer'>;

/**
 * Result of `initTRPC.create()`
 */
type InitLike = {
  _config: {
    $types: AnyClientTypes;
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
  $types: AnyClientTypes;
};

/**
 * Anything that can be inferred to the root config types needed for a TRPC client
 */
export type InferrableClientTypes =
  | RouterLike
  | InitLike
  | RootConfigLike
  | AnyClientTypes;

/**
 * Infer the root types from a InferrableClientTypes
 */
export type inferClientTypes<TInferrable extends InferrableClientTypes> =
  TInferrable extends AnyClientTypes
    ? TInferrable
    : TInferrable extends RootConfigLike
    ? TInferrable['$types']
    : TInferrable extends InitLike
    ? TInferrable['_config']['$types']
    : TInferrable extends RouterLike
    ? TInferrable['_def']['_config']['$types']
    : never;
