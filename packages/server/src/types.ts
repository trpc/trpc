/**
 * @internal
 * @deprecated
 */
export type identity<TType> = TType;

/**
 * @deprecated
 */
export type InferOptional<TType, TKeys extends keyof TType> = Omit<
  TType,
  TKeys
> &
  Partial<Pick<TType, TKeys>>;

/**
 * @deprecated
 */
export type UndefinedKeys<TType> = {
  [K in keyof TType]: undefined extends TType[K] ? K : never;
}[keyof TType];

/**
 * @internal
 * @deprecated
 */
export type FlatOverwrite<TType, TWith> = InferOptional<
  {
    [TKey in keyof TType | keyof TWith]: TKey extends keyof TWith
      ? TWith[TKey]
      : TKey extends keyof TType
      ? TType[TKey]
      : never;
  },
  UndefinedKeys<TType> | UndefinedKeys<TWith>
>;

/**
 * @internal
 */
export type IntersectionError<TKey extends string> =
  `The property '${TKey}' in your router collides with a built-in method, rename this router or procedure on your backend.`;

/**
 * @internal
 */
export type ProtectedIntersection<TType, TWith> = keyof TType &
  keyof TWith extends never
  ? TType & TWith
  : IntersectionError<string & keyof TType & keyof TWith>;

/**
 * @public
 */
export type Maybe<TType> = TType | null | undefined;

/**
 * @internal
 */
export type ThenArg<TType> = TType extends PromiseLike<infer U>
  ? ThenArg<U>
  : TType;

/**
 * @internal
 * @see https://github.com/ianstormtaylor/superstruct/blob/7973400cd04d8ad92bbdc2b6f35acbfb3c934079/src/utils.ts#L323-L325
 */
export type Simplify<TType> = TType extends any[] | Date
  ? TType
  : { [K in keyof TType]: TType[K] };
/**
 * @public
 */
export type Dict<TType> = Record<string, TType | undefined>;

/**
 * @public
 */
export type MaybePromise<TType> = Promise<TType> | TType;

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

export type FilterKeys<TObj extends object, TFilter> = {
  [TKey in keyof TObj]: TObj[TKey] extends TFilter ? TKey : never;
}[keyof TObj];

/**
 * @internal
 */
export type Filter<TObj extends object, TFilter> = Pick<
  TObj,
  FilterKeys<TObj, TFilter>
>;

/**
 * Unwrap return type if the type is a function (sync or async), else use the type as is
 * @internal
 */
export type Unwrap<TType> = TType extends (...args: any[]) => infer R
  ? ThenArg<R>
  : TType;

/**
 * Makes the object recursively optional
 * @internal
 */
export type DeepPartial<TObject> = TObject extends object
  ? {
      [P in keyof TObject]?: DeepPartial<TObject[P]>;
    }
  : TObject;

/**
 * See https://github.com/microsoft/TypeScript/issues/41966#issuecomment-758187996
 * Fixes issues with iterating over keys of objects with index signatures.
 * Without this, iterations over keys of objects with index signatures will lose
 * type information about the keys and only the index signature will remain.
 * @internal
 */
export type WithoutIndexSignature<TObj> = {
  [K in keyof TObj as string extends K
    ? never
    : number extends K
    ? never
    : K]: TObj[K];
};
