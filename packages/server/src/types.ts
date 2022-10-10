/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type identity<TType> = TType;

type MakeOptional<TType, TKeys extends keyof TType> = Partial<
  Pick<TType, TKeys>
> &
  Omit<TType, TKeys>;

type MappedC<TFirst, TSecond> = {
  [K in keyof TFirst & keyof TSecond]: TFirst[K] extends TSecond[K] ? never : K;
};

type OptionalKeys<TObj> = MappedC<TObj, Required<TObj>>[keyof TObj];

/**
 * @internal
 */
export type FlatOverwrite<TType, TWith> = Simplify<
  MakeOptional<
    {
      [TKey in keyof TWith | keyof TType]: TKey extends keyof TWith
        ? TWith[TKey]
        : TKey extends keyof TType
        ? TType[TKey]
        : never;
    },
    OptionalKeys<TWith> | Exclude<OptionalKeys<TType>, OptionalKeys<TWith>>
  >
>;

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
export type Simplify<
  TType,
  TExcludeType = never,
  TIncludeType = unknown,
> = TType extends TExcludeType
  ? TType
  : TType extends TIncludeType
  ? { [TypeKey in keyof TType]: TType[TypeKey] }
  : TType;

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
