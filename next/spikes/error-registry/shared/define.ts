/**
 * One error of the backend's registry: a tag, its HTTP status, its `data`
 * schema and the metadata tools read (OpenAPI, retries). Server code: the
 * client never imports a registry, it infers each call's errors from the
 * router's type.
 *
 * An entry is a function that makes the error, `errors.PostNotFound({ id })`,
 * for a resolver to return (or an Effect to `yield*`). The instance is a v12
 * `TrpcError.Tagged`, so v12 infers it into the procedure's union and sends
 * it with its status and `data`. The entry's statics make it a v12 error
 * spec, so a registry is also an `.errors()` map: `.errors(postErrors)`.
 */
import { Predicate, Schema } from 'effect';
import {
  TrpcError,
  type AnySchema,
  type TaggedData,
  type TaggedErrorOptions,
} from '@trpc12/trpc/server';

/** What a registry declares for one error, once for the whole backend. */
export interface ErrorSpec {
  /** The status the RPC and OpenAPI handlers answer with. */
  readonly status: number;
  /** Validates `data` where the error is made, and documents it. */
  readonly data?: AnySchema | undefined;
  readonly message?: string | undefined;
  /** OpenAPI's response description, and the docs'. */
  readonly description?: string | undefined;
  /**
   * Whether `retryLink` may retry a call that failed with it. Without codes
   * there is no "5xx retries" rule to fall back on, so the error says.
   */
  readonly retry?: boolean | undefined;
}

type DataOf<TSpec> = TSpec extends { readonly data: infer D extends AnySchema }
  ? D
  : undefined;

/** A registry error: v12's `TrpcError` whose code is its tag. */
export type RegistryErrorOf<
  TTag extends string,
  TSpec extends ErrorSpec,
> = TrpcError<TTag, TaggedData<DataOf<TSpec>>, TTag> & {
  readonly '~status'?: TSpec['status'];
};

type MakeArgs<TSpec> = [DataOf<TSpec>] extends [AnySchema]
  ? [data: TaggedData<DataOf<TSpec>>, opts?: TaggedErrorOptions]
  : [opts?: TaggedErrorOptions];

/** A registry entry: makes its error, and is the error's `.errors()` spec. */
export interface ErrorMaker<TTag extends string, TSpec extends ErrorSpec> {
  (...args: MakeArgs<TSpec>): RegistryErrorOf<TTag, TSpec>;
  readonly tag: TTag;
  readonly status: TSpec['status'];
  readonly data: DataOf<TSpec>;
  readonly message: string | undefined;
  readonly spec: TSpec;
}

/** Any registry entry. */
export interface AnyErrorMaker {
  (...args: any[]): TrpcError<string, any, string>;
  readonly tag: string;
  readonly spec: ErrorSpec;
}

/** A registry: entries by tag. */
export type Registry = { readonly [tag: string]: AnyErrorMaker };

type Made<M> = M extends (...args: any) => infer I ? I : never;

/** The union of a registry's errors. */
export type ErrorsOf<R> = Made<R[keyof R]>;

const valid = (schema: AnySchema, value: unknown): boolean => {
  if (Schema.isSchema(schema)) return Schema.is(schema)(value);
  const result = schema['~standard'].validate(value);
  return Predicate.isPromise(result) || result.issues === undefined;
};

/**
 * Makes one registry entry. Its `data` is checked when the error is made,
 * so one made in a helper deep in the backend is as safe to send as one
 * made in the resolver.
 */
export function defineError<
  const TTag extends string,
  const TSpec extends ErrorSpec,
>(tag: TTag, spec: TSpec): ErrorMaker<TTag, TSpec> {
  const Tagged = TrpcError.Tagged(tag as string, {
    status: spec.status,
    data: spec.data,
    message: spec.message,
  }) as unknown as new (...args: unknown[]) => TrpcError<string, unknown>;
  const schema = spec.data;
  const make = (...args: unknown[]) => {
    if (schema !== undefined && !valid(schema, args[0])) {
      throw new TypeError(`${tag}: data doesn't match its schema`);
    }
    return new Tagged(...args);
  };
  return Object.assign(make, {
    tag,
    status: spec.status,
    data: spec.data,
    message: spec.message,
    spec,
  }) as unknown as ErrorMaker<TTag, TSpec>;
}

/** Entries from specs by tag: `createErrors()`'s. */
export const fromSpecs = <const M extends Record<string, ErrorSpec>>(
  specs: M,
): { readonly [K in keyof M & string]: ErrorMaker<K, M[K]> } =>
  Object.fromEntries(
    Object.entries(specs).map(([tag, spec]) => [tag, defineError(tag, spec)]),
  ) as never;
