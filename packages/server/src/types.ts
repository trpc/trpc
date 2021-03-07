/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Prefix<K extends string, T extends string> = `${K}${T}`;

export type identity<T> = T;
export type format<T> = {
  [k in keyof T]: T[k];
};
export type flatten<T, Q> = identity<
  {
    [k in keyof T | keyof Q]: k extends keyof T
      ? T[k]
      : k extends keyof Q
      ? Q[k]
      : never;
  }
>;

export type Prefixer<
  TObj extends Record<string, any>,
  TPrefix extends string
> = format<
  {
    [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
  }
>;

export type Maybe<T> = T | undefined | null;

export type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

export type Dict<T> = Record<string, T>;
