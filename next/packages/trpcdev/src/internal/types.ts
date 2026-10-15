/**
 * Marks a builder slot that has not been set. An interface rather than a
 * `unique symbol`, so a published plugin's `.d.ts` can always name it.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface Unset {
  readonly '~unset': true;
}

/** @internal */
export type MaybePromise<T> = T | Promise<T>;
/** @internal */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** @internal */
export type Overwrite<A, B> = Simplify<Omit<A, keyof B> & B>;
/** @internal */
export type Merge<A, B> = A extends Unset
  ? B
  : B extends Unset
    ? A
    : Simplify<A & B>;
/** @internal */
export type Value<T> = T extends Unset ? undefined : T;
/** @internal */
export type IsAny<T> = 0 extends 1 & T ? true : false;
/** @internal */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Shows up in a type error when a builder check fails.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

/** Keys of `TNeed` that `THave` lacks or has with an incompatible type. @internal */
export type Missing<THave, TNeed> = {
  [K in keyof TNeed]-?: K extends keyof THave
    ? [THave[K]] extends [TNeed[K]]
      ? never
      : K
    : undefined extends TNeed[K]
      ? never
      : K;
}[keyof TNeed];

type Leaf =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp
  | URL
  | Error
  | Uint8Array
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ((...args: any[]) => unknown);

/** Data without thenables or iterables, which arrives as it is sent. */
type Plain =
  | Exclude<Leaf, (...args: any[]) => unknown>
  | readonly Plain[]
  | { readonly [key: string]: Plain };

/**
 * A value as the client receives it: generators arrive as plain
 * `AsyncIterable`s and thenables as `Promise`s, at any depth.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type Deserialized<T> =
  IsAny<T> extends true
    ? any
    : [T] extends [Plain]
      ? T
      : T extends Leaf
        ? T
        : T extends AsyncIterable<infer U>
          ? AsyncIterable<Deserialized<U>>
          : T extends PromiseLike<infer U>
            ? Promise<Deserialized<U>>
            : { [K in keyof T]: Deserialized<T[K]> };

/**
 * `query`, `mutation` or `subscription`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';
