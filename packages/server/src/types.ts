/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Prefix<K extends string, T extends string> = `${K}${T}`;

export type identity<T> = T;
export type format<T extends object> = identity<{ [k in keyof T]: T[k] }>;
export type EmptyObject = Record<string, never>;

export type Prefixer<
  TObj extends Record<string, any>,
  TPrefix extends string
> = format<
  {
    [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
  }
>;

export type DropFirst<T extends readonly unknown[]> = T extends readonly [
  any?,
  ...infer U
]
  ? U
  : [...T];

export type Maybe<T> = T | undefined | null;

export type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;
