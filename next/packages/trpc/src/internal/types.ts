/**
 * Marks a builder slot that has not been set. An interface rather than a
 * `unique symbol`, so a published plugin's `.d.ts` can always name it.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type Deserialized<T> =
  IsAny<T> extends true
    ? any
    : unknown extends T
      ? unknown
      : [T] extends [Plain]
        ? T
        : T extends ProcedureResponse
          ? globalThis.Response
          : T extends Leaf
            ? T
            : T extends ReadableStream<infer U>
              ? ReadableStream<Deserialized<U>>
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
 * Which output types a serializer keeps, at the type level. A link declares
 * its serializer's form, so client types follow it.
 * @since 0.1.0
 * @stability stable
 */
export interface OutputForm {
  /** Types a sync serializer rebuilds; everything else arrives as JSON. */
  readonly keeps: unknown;
  /** Deferred values and files at any depth (danSON), or only at the root. */
  readonly streaming: boolean;
  /**
   * The form errors' `data` arrives in, for a `streaming` form whose
   * outputs a link decodes ({@link DecodedJsonForm}); otherwise it's the
   * outputs' form.
   */
  readonly errorData?: OutputForm;
}

/**
 * danSON's form, and in-process callers': native types, deferred values at any depth.
 * @since 0.1.0
 * @stability stable
 */
export interface DansonForm extends OutputForm {
  readonly keeps: unknown;
  readonly streaming: true;
}

/**
 * A sync serializer's form: `TKeeps` survive, the rest arrives in its JSON
 * form. Root generators and promises are still framed by the transport.
 * @since 0.1.0
 * @stability stable
 */
export interface SyncForm<TKeeps> extends OutputForm {
  readonly keeps: TKeeps;
  readonly streaming: false;
}

/**
 * Plain JSON's form: every value arrives as `JSON.parse(JSON.stringify(v))`.
 * @since 0.1.0
 * @stability stable
 */
export type JsonForm = SyncForm<never>;

/**
 * Plain JSON whose outputs a link decodes with their schemas, as
 * `experimental_validationLink`'s `output: 'json'` does: outputs arrive as
 * their types, errors' `data` in plain JSON's form.
 * @since 0.1.0
 * @stability experimental
 */
export interface DecodedJsonForm extends DansonForm {
  readonly errorData: JsonForm;
}

type Dropped = undefined | symbol | ((...args: any[]) => unknown);
type JsonItem<T, K, D extends boolean> =
  | JsonOf<Exclude<T, Dropped>, K, D>
  | ([Extract<T, Dropped>] extends [never] ? never : null);
type Kept<T> = [Exclude<T, Dropped>] extends [never] ? false : true;
type JsonObject<T, K, D extends boolean> = Simplify<
  {
    [
      P in keyof T as P extends string
        ? unknown extends T[P]
          ? P
          : undefined extends T[P]
            ? never
            : Kept<T[P]> extends true
              ? P
              : never
        : never
    ]: JsonOf<T[P], K, D>;
  } & {
    [
      P in keyof T as P extends string
        ? unknown extends T[P]
          ? never
          : undefined extends T[P]
            ? Kept<T[P]> extends true
              ? P
              : never
            : never
        : never
    ]?: JsonOf<Exclude<T[P], Exclude<Dropped, K>>, K, D>;
  }
>;

/**
 * Already JSON: kept as written, so recursive and branded types stay
 * intact. `undefined` object values are dropped keys, which an optional
 * key already allows.
 */
type JsonSafe =
  | string
  | number
  | boolean
  | null
  | readonly JsonSafe[]
  | { readonly [key: string]: JsonSafe | undefined };

type Deferred<T, K> =
  T extends ReadableStream<infer U>
    ? ReadableStream<JsonOf<U, K, true>>
    : T extends AsyncIterable<infer U, infer R>
      ? IsAny<R> extends true
        ? AsyncIterable<JsonOf<U, K, true>>
        : [R] extends [void]
          ? AsyncIterable<JsonOf<U, K, true>>
          : AsyncIterable<JsonOf<U, K, true>, JsonOf<R, K, true>>
      : T extends PromiseLike<infer U>
        ? Promise<JsonOf<U, K, true>>
        : never;

/**
 * A value after a JSON round trip, keeping the types in `K`: `Date` becomes
 * `string`, `Map` and `Set` become `{}`, `undefined` keys are dropped and
 * `undefined` array items become `null`. With `D`, promises and streams in
 * plain objects and arrays stay deferred, as the transport streams them.
 * @since 0.1.0
 * @stability stable
 */
export type JsonOf<T, K = never, D extends boolean = false> =
  IsAny<T> extends true
    ? any
    : unknown extends T
      ? unknown
      : T extends K
        ? T
        : [T] extends [JsonSafe]
          ? T
          : D extends true
            ? T extends
                | PromiseLike<unknown>
                | AsyncIterable<unknown>
                | ReadableStream
              ? Deferred<T, K>
              : JsonValueOf<T, K, D>
            : JsonValueOf<T, K, D>;

type JsonValueOf<T, K, D extends boolean> = T extends { toJSON(): infer J }
  ? JsonOf<J, K, D>
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
          ? { -readonly [I in keyof T]: JsonItem<T[I], K, D> }
          : T extends object
            ? JsonObject<T, K, D>
            : never;

type Framed<T, K> = [T] extends [JsonSafe]
  ? T
  : IsAny<T> extends true
    ? any
    : T extends ProcedureResponse
      ? globalThis.Response
      : T extends Blob
        ? T
        :
            | JsonOf<Exclude<T, void>, K, true>
            | (undefined extends T ? undefined : never);

/**
 * A procedure's output as the client receives it under a serializer's form.
 * @since 0.1.0
 * @stability stable
 */
export type ClientValue<
  T,
  F extends OutputForm = DansonForm,
> = F['streaming'] extends true ? Deserialized<T> : Framed<T, F['keeps']>;

/**
 * The output form of a serializer type; plain JSON's for `undefined`.
 * @since 0.1.0
 * @stability stable
 */
export type FormOfSerializer<S> = S extends { readonly '~form'?: infer F }
  ? NonNullable<F> extends infer G extends OutputForm
    ? G
    : JsonForm
  : JsonForm;

/** The form of a link options bag's `serializer`; plain JSON's without one. @internal */
export type FormOfOptions<TOpts> = FormOfSerializer<
  TOpts extends { serializer?: infer S } ? NonNullable<S> : undefined
>;

/**
 * `query`, `mutation` or `subscription`.
 * @since 0.1.0
 * @stability stable
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';

/**
 * Meta keys a root doesn't declare become `never`, so `.meta({ route })`
 * without the extension that adds `route` is an error.
 * @internal
 */
export type UndeclaredMeta<TMeta, $Meta> = {
  [K in Exclude<keyof $Meta, keyof TMeta>]: never;
};
