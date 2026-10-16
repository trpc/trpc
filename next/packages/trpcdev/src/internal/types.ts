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
  | Blob
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ((...args: any[]) => unknown);

/** Data without thenables or iterables, which arrives as it is sent. */
/** What a procedure returns to send its own response: `HttpServerResponse` or a web `Response`. @internal */
export type ProcedureResponse =
  | { readonly '~effect/http/HttpServerResponse': unknown }
  | globalThis.Response;

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
      : T extends ProcedureResponse
        ? globalThis.Response
        : T extends Leaf
          ? T
          : T extends AsyncIterable<infer U, infer R>
            ? IsAny<R> extends true
              ? AsyncIterable<Deserialized<U>>
              : [R] extends [void]
                ? AsyncIterable<Deserialized<U>>
                : AsyncIterable<Deserialized<U>, Deserialized<R>>
            : T extends PromiseLike<infer U>
              ? Promise<Deserialized<U>>
              : { [K in keyof T]: Deserialized<T[K]> };

/**
 * Which output types a serializer keeps, at the type level. Declared on
 * `initTrpc<{ serializer }>()` through the serializer's type, so client
 * types follow it.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OutputForm {
  /** Types a sync serializer rebuilds; everything else arrives as JSON. */
  readonly keeps: unknown;
  /** Deferred values and files at any depth (danSON), or only at the root. */
  readonly streaming: boolean;
}

/**
 * The default serializer's form: native types, deferred values at any depth.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface DansonForm extends OutputForm {
  readonly keeps: unknown;
  readonly streaming: true;
}

/**
 * A sync serializer's form: `TKeeps` survive, the rest arrives in its JSON
 * form. Root generators and promises are still framed by the transport.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SyncForm<TKeeps> extends OutputForm {
  readonly keeps: TKeeps;
  readonly streaming: false;
}

/**
 * Plain JSON's form: every value arrives as `JSON.parse(JSON.stringify(v))`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type JsonForm = SyncForm<never>;

type Dropped = undefined | symbol | ((...args: any[]) => unknown);
type JsonItem<T, K> =
  | JsonOf<Exclude<T, Dropped>, K>
  | ([Extract<T, Dropped>] extends [never] ? never : null);
type Kept<T> = [Exclude<T, Dropped>] extends [never] ? false : true;
type JsonObject<T, K> = Simplify<
  {
    [
      P in keyof T as P extends string
        ? undefined extends T[P]
          ? never
          : Kept<T[P]> extends true
            ? P
            : never
        : never
    ]: JsonOf<T[P], K>;
  } & {
    [
      P in keyof T as P extends string
        ? undefined extends T[P]
          ? Kept<T[P]> extends true
            ? P
            : never
          : never
        : never
    ]?: JsonOf<Exclude<T[P], Dropped>, K>;
  }
>;

/**
 * A value after a JSON round trip, keeping the types in `K`: `Date` becomes
 * `string`, `Map` and `Set` become `{}`, `undefined` keys are dropped and
 * `undefined` array items become `null`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type JsonOf<T, K = never> =
  IsAny<T> extends true
    ? any
    : T extends K
      ? T
      : T extends { toJSON(): infer J }
        ? JsonOf<J, K>
        : T extends string | number | boolean | null
          ? T
          : T extends Dropped | bigint
            ? never
            : T extends
                  | ReadonlyMap<unknown, unknown>
                  | ReadonlySet<unknown>
                  | Error
                  | RegExp
                  | Blob
                  | PromiseLike<unknown>
                  | AsyncIterable<unknown>
                  | ReadableStream
              ? Record<string, never>
              : T extends readonly unknown[]
                ? { -readonly [I in keyof T]: JsonItem<T[I], K> }
                : T extends object
                  ? JsonObject<T, K>
                  : never;

type Framed<T, K> =
  IsAny<T> extends true
    ? any
    : T extends ProcedureResponse
      ? globalThis.Response
      : T extends AsyncIterable<infer U, infer R>
        ? IsAny<R> extends true
          ? AsyncIterable<JsonOf<U, K>>
          : [R] extends [void]
            ? AsyncIterable<JsonOf<U, K>>
            : AsyncIterable<JsonOf<U, K>, JsonOf<R, K>>
        : T extends PromiseLike<infer U>
          ? Promise<JsonOf<U, K>>
          :
              | JsonOf<Exclude<T, void>, K>
              | (undefined extends T ? undefined : never);

/**
 * A procedure's output as the client receives it under a serializer's form.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ClientValue<
  T,
  F extends OutputForm = DansonForm,
> = F['streaming'] extends true ? Deserialized<T> : Framed<T, F['keeps']>;

/**
 * The output form a procedure def declares; danSON's when it declares none.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type FormOf<D> = D extends { serializer: infer F extends OutputForm }
  ? F
  : DansonForm;

/**
 * `query`, `mutation` or `subscription`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';
