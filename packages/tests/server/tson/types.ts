export type Branded<TType, TBrand> = TType & { __brand: TBrand };

export type TsonNonce = Branded<string, 'TsonNonce'>;
export type TsonTypeHandlerKey = Branded<string, 'TsonTypeHandlerKey'>;
export type TsonEncodedValue = unknown;

export type TsonTuple = [TsonTypeHandlerKey, TsonEncodedValue, TsonNonce];

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

type EncodedType =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[];

export interface TsonTransformerNone {
  /**
   * Won't be decoded nor encoded
   */
  transform: false;

  encode?: never;
  decode?: never;
}
export interface TsonTransformerEncodeDecode<
  TValue,
  TEncodedType extends EncodedType,
> {
  /**
   * Use a transformer to encode and decode the value?
   */
  transform?: true;

  /**
   * JSON-serializable value
   */
  encode: (v: TValue) => TEncodedType;
  /**
   * From JSON-serializable value
   */
  decode: (v: TEncodedType) => TValue;
}

export type TsonTransformer<TValue, TEncodedType extends EncodedType> =
  | TsonTransformerNone
  | TsonTransformerEncodeDecode<TValue, TEncodedType>;

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
   * JSON-serializable value how it's stored after it's encoded
   */
  TEncodedType extends EncodedType,
> = TsonTypeTester & TsonTransformer<TValue, TEncodedType>;

export interface TsonOptions {
  nonce?: () => string;
  types: Record<
    string,
    TsonTypeHandler<any, any> | TsonTypeHandler<any, never>
  >;
}

export type TsonEncoded = {
  json: TsonEncodedValue;
  nonce: TsonNonce;
};
