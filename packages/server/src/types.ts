/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type identity<T> = T;

/**
 * @internal
 */
export type FlatOverwrite<T, K> = identity<{
  [TKey in keyof K | keyof T]: TKey extends keyof K
    ? K[TKey]
    : TKey extends keyof T
    ? T[TKey]
    : never;
}>;

/**
 * @public
 */
export type Maybe<T> = T | undefined | null;

/**
 * @internal
 */
export type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

/**
 * @internal
 */
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] };

/**
 * @public
 */
export type Dict<T> = Record<string, T | undefined>;

/**
 * @public
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * @internal
 *
 * Creates a "lower-priority" type inference.
 * https://github.com/microsoft/TypeScript/issues/14829#issuecomment-322267089
 */
export type InferLast<T> = T & { [K in keyof T]: T[K] };

/**
 * @public
 */
export type inferAsyncReturnType<TFunction extends (...args: any) => any> =
  ThenArg<ReturnType<TFunction>>;

type FilterKeys<T extends object, K> = {
  [TKey in keyof T]: T[TKey] extends K ? TKey : never;
}[keyof T];

/**
 * @internal
 */
export type Filter<T extends object, K> = Pick<T, FilterKeys<T, K>>;
