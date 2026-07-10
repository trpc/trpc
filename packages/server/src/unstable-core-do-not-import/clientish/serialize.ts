/* eslint-disable @typescript-eslint/naming-convention */
import type { Simplify, WithoutIndexSignature } from '../types';

/**
 * @see https://github.com/remix-run/remix/blob/2248669ed59fd716e267ea41df5d665d4781f4a9/packages/remix-server-runtime/serialize.ts
 */
type JsonPrimitive = boolean | number | string | null;
type JsonArray = JsonValue[] | readonly JsonValue[];
type JsonObject = {
  readonly [key: string | number]: JsonValue;
  [key: symbol]: never;
};
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

type IsJson<T> = T extends JsonValue ? true : false;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NonJsonPrimitive = Function | symbol | undefined;
/*
 * `any` is the only type that can let you equate `0` with `1`
 * See https://stackoverflow.com/a/49928360/1490091
 */
type IsAny<T> = 0 extends T & 1 ? true : false;

// `undefined` is a weird one that's technically not valid JSON,
// but the return value of `JSON.parse` can be `undefined` so we
// support it as both a Primitive and a NonJsonPrimitive
type JsonReturnable = JsonPrimitive | undefined;

type IsRecord<T extends object> = keyof WithoutIndexSignature<T> extends never
  ? true
  : false;

/* prettier-ignore */
export type Serialize<T> =
  IsAny<T> extends true ? any :
  unknown extends T ? unknown :
  IsJson<T> extends true ? T :
  T extends AsyncIterable<infer $T, infer $Return, infer $Next> ? AsyncIterable<Serialize<$T>, Serialize<$Return>, Serialize<$Next>> :
  T extends PromiseLike<infer $T> ? Promise<Serialize<$T>> :
  T extends JsonReturnable ? T :
  T extends Map<any, any> | Set<any> ? object :
  T extends NonJsonPrimitive ? never :
  T extends { toJSON(): infer U } ? U :
  T extends [] ? [] :
  T extends [unknown, ...unknown[]] ? SerializeTuple<T> :
  T extends readonly (infer U)[] ? (U extends NonJsonPrimitive ? null : Serialize<U>)[] :
  T extends object ?
    IsRecord<T> extends true ? Record<keyof T, Serialize<T[keyof T]>> :
    Simplify<SerializeObject<UndefinedToOptional<T>>> :
  never;

/** JSON serialize [tuples](https://www.typescriptlang.org/docs/handbook/2/objects.html#tuple-types) */
type SerializeTuple<T extends [unknown, ...unknown[]]> = {
  [K in keyof T]: T[K] extends NonJsonPrimitive ? null : Serialize<T[K]>;
};

// prettier-ignore
type SerializeObjectKey<T extends Record<any, any>, K> = 
  // never include entries where the key is a symbol
  K extends symbol ? never : 
  // always include entries where the value is any
  IsAny<T[K]> extends true ? K :
  // always include entries where the value is unknown
  unknown extends T[K] ? K : 
  // never include entries where the value is a non-JSON primitive
  T[K] extends NonJsonPrimitive ? never : 
  // otherwise serialize the value
  K;
/**
 * JSON serialize objects (not including arrays) and classes
 * @internal
 **/
export type SerializeObject<T extends object> = {
  [K in keyof T as SerializeObjectKey<T, K>]: Serialize<T[K]>;
};

/**
 * Extract keys from T where the value dosen't extend undefined
 * Note: Can't parse IndexSignature or Record types
 */
type FilterDefinedKeys<T extends object> = Exclude<
  {
    [K in keyof T]: undefined extends T[K] ? never : K;
  }[keyof T],
  undefined
>;

/**
 * Get value of exactOptionalPropertyTypes config
 */
type ExactOptionalPropertyTypes = { a?: 0 | undefined } extends {
  a?: 0;
}
  ? false
  : true;

/**
 * Check if T has an index signature
 */
type HasIndexSignature<T extends object> = string extends keyof T
  ? true
  : false;

/**
 * { [key: string]: number | undefined } --> { [key: string]: number }
 */
type HandleIndexSignature<T extends object> = {
  [K in keyof Omit<T, keyof WithoutIndexSignature<T>>]: Exclude<
    T[K],
    undefined
  >;
};

/**
 * { a: number | undefined } --> { a?: number }
 * Note: Can't parse IndexSignature or Record types
 */
type HandleUndefined<T extends object> = {
  [K in keyof Omit<T, FilterDefinedKeys<T>>]?: Exclude<T[K], undefined>;
};

/**
 * Handle undefined, index signature and records
 */
type UndefinedToOptional<T extends object> =
  // Property is not a union with `undefined`, keep as-is
  Pick<WithoutIndexSignature<T>, FilterDefinedKeys<WithoutIndexSignature<T>>> &
    // If following is true, don't merge undefined or optional into index signature if any in T
    (ExactOptionalPropertyTypes extends true
      ? HandleIndexSignature<T> & HandleUndefined<WithoutIndexSignature<T>>
      : HasIndexSignature<T> extends true
        ? HandleIndexSignature<T>
        : HandleUndefined<T>);
