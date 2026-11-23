import type { AnyRootTypes } from '../rootConfig';

/** The root types a client needs: the error shape and whether there's a transformer. */
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
 * Anything a client's root types can be read from: a router, a root
 * object, a root config or the types themselves.
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
 * The root types a client needs, read from a router, a root object or a
 * root config.
 */
export type inferClientTypes<TInferrable extends InferrableClientTypes> =
  TInferrable extends AnyClientTypes
    ? PickTypes<TInferrable>
    : TInferrable extends RootConfigLike
      ? PickTypes<TInferrable['$types']>
      : TInferrable extends InitLike
        ? PickTypes<TInferrable['_config']['$types']>
        : TInferrable extends RouterLike
          ? PickTypes<TInferrable['_def']['_config']['$types']>
          : never;
