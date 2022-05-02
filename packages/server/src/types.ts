/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * @internal
 */
export type Prefix<K extends string, T extends string> = `${K}${T}`;

/**
 * @internal
 */
export type identity<T> = T;

/**
 * @internal
 */
export type flatten<T, Q> = identity<{
  [k in keyof T | keyof Q]: k extends keyof T
    ? T[k]
    : k extends keyof Q
    ? Q[k]
    : never;
}>;

/**
 * @internal
 */
export type Prefixer<
  TObj extends Record<string, any>,
  TPrefix extends string,
> = {
  [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
};

/**
 * @public
 */
export type Maybe<T> = T | undefined | null;

/**
 * @internal
 */
export type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

/**
 * @public
 */
export type Dict<T> = Record<string, T | undefined>;

/**
 * @public
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * @internal
 *
 * Creates a "lower-priority" type inference.
 * https://github.com/microsoft/TypeScript/issues/14829#issuecomment-322267089
 */
export type InferLast<T> = T & { [K in keyof T]: T[K] };

/**
 * @public
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';
