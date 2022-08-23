/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type Prefix<K extends string, T extends string> = `${K}${T}`;

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
 * @internal
 */
export type Prefixer<
  TObj extends Record<string, any>,
  TPrefix extends string,
> = {
  [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
};

/**
 * @public
 */
export type Maybe<T> = T | undefined | null;

/**
 * @internal
 */
export type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

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

/**
 * @internal
 */
export type NeverKeys<T> = {
  [TKey in keyof T]: T[TKey] extends never ? TKey : never;
}[keyof T];

/**
 * @internal
 */
export type OmitNeverKeys<T> = Omit<T, NeverKeys<T>>;
