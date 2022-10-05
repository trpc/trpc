/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type identity<TType> = TType;

export type InferOptional<TType, TKeys extends keyof TType> = Partial<
  Pick<TType, TKeys>
> &
  Omit<TType, TKeys>;

type OmitNever<TType> = Pick<
  TType,
  {
    [K in keyof TType]: TType[K] extends never ? never : K;
  }[keyof TType]
>;

type UndefinedKeys<TType> = keyof OmitNever<{
  [K in keyof TType]: TType[K] extends undefined ? TType : never;
}>;

export type FlatOverwrite<TType, TWith> = Simplify<
  InferOptional<
    {
      [TKey in keyof TWith | keyof TType]: TKey extends keyof TWith
        ? TWith[TKey]
        : TKey extends keyof TType
        ? TType[TKey]
        : never;
    },
    UndefinedKeys<TType> | UndefinedKeys<TWith>
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
