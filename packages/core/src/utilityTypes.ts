/**
 * @public
 */
export type Maybe<TType> = TType | null | undefined;

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
  ? Awaited<R>
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
 * Omits the key without removing a potential union
 * @internal
 */
export type DistributiveOmit<TObj, TKey extends keyof any> = TObj extends any
  ? Omit<TObj, TKey>
  : never;

/*
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

/**
 * @internal
 * Overwrite properties in `TType` with properties in `TWith`
 * Only overwrites properties when the type to be overwritten
 * is an object. Otherwise it will just use the type from `TWith`.
 */
export type Overwrite<TType, TWith> = TWith extends any
  ? TType extends object
    ? {
        [K in  // Exclude index signature from keys
          | keyof WithoutIndexSignature<TType>
          | keyof WithoutIndexSignature<TWith>]: K extends keyof TWith
          ? TWith[K]
          : K extends keyof TType
          ? TType[K]
          : never;
      } & (string extends keyof TWith // Handle cases with an index signature
        ? { [key: string]: TWith[string] }
        : number extends keyof TWith
        ? { [key: number]: TWith[number] }
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {})
    : TWith
  : never;

/**
 * @internal
 */
export type DefaultValue<TValue, TFallback> = UnsetMarker extends TValue
  ? TFallback
  : TValue;

/**
 * @internal
 */
export const unsetMarker = Symbol('unsetMarker');
/**
 * @internal
 */
export type UnsetMarker = typeof unsetMarker;

/**
 * @internal
 */
export type ValidateShape<TActualShape, TExpectedShape> =
  TActualShape extends TExpectedShape
    ? Exclude<keyof TActualShape, keyof TExpectedShape> extends never
      ? TActualShape
      : TExpectedShape
    : never;

/**
 * @internal
 */
export type PickFirstDefined<TType, TPick> = undefined extends TType
  ? undefined extends TPick
    ? never
    : TPick
  : TType;
