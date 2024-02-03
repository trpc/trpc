import type { AnyRootTypes } from '../rootConfig';

export type AnyClientRootTypes = Pick<
  AnyRootTypes,
  'errorShape' | 'transformer'
>;

type ClientTypes<TConfig extends AnyClientRootTypes> = {
  errorShape: TConfig['errorShape'];
  transformer: TConfig['transformer'];
};

/**
 * Result of `initTRPC.create()`
 */
type InitLike = {
  _config: {
    $types: AnyClientRootTypes;
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
  $types: AnyClientRootTypes;
};

/**
 * Anything that can be inferred to the root config types needed for a TRPC client
 */
export type InferrableClientTypes =
  | RouterLike
  | InitLike
  | RootConfigLike
  | AnyClientRootTypes;

/**
 * Infer the root types from a InferrableClientTypes and simplifies it
 */
export type inferRootTypes<TInferrable extends InferrableClientTypes> =
  TInferrable extends AnyClientRootTypes
    ? ClientTypes<{
        errorShape: TInferrable['errorShape'];
        transformer: TInferrable['transformer'];
      }>
    : TInferrable extends RootConfigLike
    ? ClientTypes<{
        errorShape: TInferrable['$types']['errorShape'];
        transformer: TInferrable['$types']['transformer'];
      }>
    : TInferrable extends InitLike
    ? ClientTypes<{
        errorShape: TInferrable['_config']['$types']['errorShape'];
        transformer: TInferrable['_config']['$types']['transformer'];
      }>
    : TInferrable extends RouterLike
    ? ClientTypes<{
        errorShape: TInferrable['_def']['_config']['$types']['errorShape'];
        transformer: TInferrable['_def']['_config']['$types']['transformer'];
      }>
    : never;

export type inferErrorShape<TInferrable extends InferrableClientTypes> =
  inferRootTypes<TInferrable>['errorShape'];
