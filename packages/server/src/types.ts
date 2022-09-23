/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type identity<TType> = TType;

/**
 * @internal
 */
export type FlatOverwrite<TType, TWith> = identity<{
  [TKey in keyof TWith | keyof TType]: TKey extends keyof TWith
    ? TWith[TKey]
    : TKey extends keyof TType
    ? TType[TKey]
    : never;
}>;

/**
 * @public
 */
export type Maybe<TType> = TType | undefined | null;

/**
 * @internal
 */
export type ThenArg<TType> = TType extends PromiseLike<infer U>
  ? ThenArg<U>
  : TType;

/**
 * @internal
 */
export type Simplify<TType> = { [KeyType in keyof TType]: TType[KeyType] };

/**
 * @public
 */
export type Dict<TType> = Record<string, TType | undefined>;

/**
 * @public
 */
export type MaybePromise<TType> = TType | Promise<TType>;

/**
 * @internal
 *
 * Creates a "lower-priority" type inference.
 * https://github.com/microsoft/TypeScript/issues/14829#issuecomment-322267089
 */
export type InferLast<TType> = TType & {
  [KeyType in keyof TType]: TType[KeyType];
};

/**
 * @public
 */
export type inferAsyncReturnType<TFunction extends (...args: any) => any> =
  ThenArg<ReturnType<TFunction>>;

type FilterKeys<TObj extends object, TFilter> = {
  [TKey in keyof TObj]: TObj[TKey] extends TFilter ? TKey : never;
}[keyof TObj];

/**
 * @internal
 */
export type Filter<TObj extends object, TFilter> = Pick<
  TObj,
  FilterKeys<TObj, TFilter>
>;
