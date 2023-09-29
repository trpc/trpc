export type Branded<TType, TBrand> = TType & { __brand: TBrand };

export type TsonNonce = Branded<string, 'TsonNonce'>;
export type TsonTypeHandlerKey = Branded<string, 'TsonTypeHandlerKey'>;
export type TsonEncodedValue = unknown;
export type TsonReferences = Branded<TsonEncodedValue[], 'TsonReferences'>;

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

type JsonTypes = string | number | boolean | null | Record<string, any> | any[];
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
  TEncodedType extends JsonTypes,
> {
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

export type TsonTransformer<TValue, TEncodedType extends JsonTypes> =
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
  TValue,
  TEncodedType extends JsonTypes,
> = TsonTypeTester & TsonTransformer<TValue, TEncodedType>;

export interface TsonOptions {
  nonce?: () => string;
  types: Record<string, TsonTypeHandler<any, any>>;
}

export type TsonSerialized = {
  json: TsonEncodedValue;
  nonce: TsonNonce;
};
