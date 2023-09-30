const brand = Symbol('branded');

export type TsonBranded<TType, TBrand> = TType & { [brand]: TBrand };
export type inferBrand<TType> = TType extends TsonBranded<infer _, infer T>
  ? T
  : never;
export type TsonNonce = TsonBranded<string, 'TsonNonce'>;
export type TsonTypeHandlerKey = TsonBranded<string, 'TsonTypeHandlerKey'>;
export type TsonSerializedValue = unknown;

export type TsonTuple = [TsonTypeHandlerKey, TsonSerializedValue, TsonNonce];

// there's probably a better way of getting this type
export type TsonAllTypes =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'symbol'
  | 'undefined'
  | 'object'
  | 'function';

type SerializedType =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[];

export interface TsonTransformerNone {
  /**
   * Won't be deserialized nor serialized
   */
  transform: false;

  serialize?: never;
  deserialize?: never;
}
export interface TsonTransformerSerializeDeserialize<
  TValue,
  TSerializedType extends SerializedType,
> {
  /**
   * Use a transformer to serialize and deserialize the value?
   */
  transform?: true;

  /**
   * JSON-serializable value
   */
  serialize: (v: TValue) => TSerializedType;
  /**
   * From JSON-serializable value
   */
  deserialize: (v: TSerializedType) => TValue;
}

export type TsonTransformer<TValue, TSerializedType extends SerializedType> =
  | TsonTransformerNone
  | TsonTransformerSerializeDeserialize<TValue, TSerializedType>;

export interface TsonTypeTesterPrimitive {
  /**
   * The type of the primitive
   */
  primitive: TsonAllTypes;
  /**
   * Test if the value is of this type
   */
  test?: (v: unknown) => boolean;
}
export interface TsonTypeTesterCustom {
  /**
   * The type of the primitive
   */
  primitive?: never;
  /**
   * Test if the value is of this type
   */
  test: (v: unknown) => boolean;
}

type TsonTypeTester = TsonTypeTesterPrimitive | TsonTypeTesterCustom;

export type TsonTypeHandler<
  /**
   * The type of the value
   */
  TValue,
  /**
   * JSON-serializable value how it's stored after it's serialized
   */
  TSerializedType extends SerializedType,
> = TsonTypeTester & TsonTransformer<TValue, TSerializedType>;

export interface TsonOptions {
  nonce?: () => string;
  types: Record<
    string,
    TsonTypeHandler<any, any> | TsonTypeHandler<any, never>
  >;
}

export type TsonSerialized = {
  json: TsonSerializedValue;
  nonce: TsonNonce;
};

export type TsonSerializeFn = <TValue>(
  obj: TValue,
) => TsonBranded<TsonSerialized, TValue>;

export type TsonDeserializeFn = <TSerialized extends TsonSerialized>(
  data: TSerialized,
) => inferBrand<TSerialized>;

export type TsonParseFn = <TValue extends string>(
  string: TValue,
) => inferBrand<TValue>;

export type TsonStringifyFn = <TValue>(
  obj: TValue,
  space?: string | number,
) => TsonBranded<string, TValue>;
