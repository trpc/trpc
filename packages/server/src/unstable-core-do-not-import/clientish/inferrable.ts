import type { AnyRootTypes } from '../rootConfig';
import type { AnyRouter, inferRouterError } from '../router';

export type AnyClientTypes = Pick<AnyRootTypes, 'errorShape' | 'transformer'>;

/**
 * Result of `initTRPC.create()`
 */
type InitLike = {
  _config: {
    $types: AnyClientTypes;
  };
};

type RouterLike = AnyRouter;

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

type PickTypes<T extends AnyClientTypes> = {
  transformer: T['transformer'];
  errorShape: T['errorShape'];
};
/**
 * Infer the root types from a InferrableClientTypes
 */
export type inferClientTypes<TInferrable extends InferrableClientTypes> =
  TInferrable extends AnyClientTypes
    ? PickTypes<TInferrable>
    : TInferrable extends RootConfigLike
      ? PickTypes<TInferrable['$types']>
      : TInferrable extends InitLike
        ? PickTypes<TInferrable['_config']['$types']>
        : TInferrable extends RouterLike
          ? {
              transformer: TInferrable['_def']['_config']['$types']['transformer'];
              errorShape: inferRouterError<TInferrable>;
            }
          : never;
