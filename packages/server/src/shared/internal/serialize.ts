/* eslint-disable @typescript-eslint/naming-convention */
import { FilterKeys } from '../../types';

/**
 * @link https://github.com/remix-run/remix/blob/2248669ed59fd716e267ea41df5d665d4781f4a9/packages/remix-server-runtime/serialize.ts
 */
type JsonPrimitive =
  | string
  | number
  | boolean
  | String
  | Number
  | Boolean
  | null;
type NonJsonPrimitive = undefined | Function | symbol;

/*
 * `any` is the only type that can let you equate `0` with `1`
 * See https://stackoverflow.com/a/49928360/1490091
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

// prettier-ignore
export type Serialize<T> =
 IsAny<T> extends true ? any :
 T extends JsonPrimitive ? T :
 T extends Map<any,any> | Set<any> ? {} : 
 T extends NonJsonPrimitive ? never :
 T extends { toJSON(): infer U } ? U :
 T extends [] ? [] :
 T extends [unknown, ...unknown[]] ? SerializeTuple<T> :
 T extends ReadonlyArray<infer U> ? (U extends NonJsonPrimitive ? null : Serialize<U>)[] :
 T extends object ? SerializeObject<UndefinedToOptional<T>> :
 never;

/** JSON serialize [tuples](https://www.typescriptlang.org/docs/handbook/2/objects.html#tuple-types) */
type SerializeTuple<T extends [unknown, ...unknown[]]> = {
  [k in keyof T]: T[k] extends NonJsonPrimitive ? null : Serialize<T[k]>;
};

/** JSON serialize objects (not including arrays) and classes */
type SerializeObject<T extends object> = {
  [k in keyof Omit<T, FilterKeys<T, NonJsonPrimitive>>]: Serialize<T[k]>;
};

/*
 * For an object T, if it has any properties that are a union with `undefined`,
 * make those into optional properties instead.
 *
 * Example: { a: string | undefined} --> { a?: string}
 */

type FilterDefinedKeys<TObj extends object> = Exclude<
  {
    [TKey in keyof TObj]: undefined extends TObj[TKey] ? never : TKey;
  }[keyof TObj],
  undefined
>;

type UndefinedToOptional<T extends object> =
  // Property is not a union with `undefined`, keep as-is
  Pick<T, FilterDefinedKeys<T>> & {
    // Property _is_ a union with `defined`. Set as optional (via `?`) and remove `undefined` from the union
    [k in keyof Omit<T, FilterDefinedKeys<T>>]?: Exclude<T[k], undefined>;
  };
