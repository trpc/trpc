type Branded<TType, TBrand> = TType & { __brand: TBrand };

export type TsonNonce = Branded<string, 'TsonNonce'>;
export type TsonTypeHandlerKey = Branded<string, 'TsonTypeHandlerKey'>;
export type TsonSerializedValue = unknown;
export type TsonReferences = Branded<TsonSerializedValue[], 'TsonReferences'>;

export type TsonTuple = [TsonNonce, TsonTypeHandlerKey, TsonSerializedValue];

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

export interface TsonTransformerNone {
  /**
   * Won't be decoded nor encoded
   */
  transform: false;
}
export interface TsonTransformerEncodeDecode<TValue> {
  transform?: true;

  /**
   * JSON-serializable value
   */
  encode: (v: TValue) => TsonSerializedValue;
  /**
   * From JSON-serializable value
   */
  decode: (v: TsonSerializedValue) => TValue;
}

export type TsonTransformer<TValue> =
  | TsonTransformerNone
  | TsonTransformerEncodeDecode<TValue>;

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

export type TsonTypeHandler<TValue> = TsonTypeTester & TsonTransformer<TValue>;

// export type TsonTypeHandlerFactory<TValue> = () => TsonTypeHandler<TValue>;
export interface TsonOptions {
  nonce?: () => string;
  types: Record<string, TsonTypeHandler<any>>;
}

export type TsonSerialized = [
  TsonSerializedValue,
  TsonNonce,
  ...TsonReferences,
];
