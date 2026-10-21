/**
 * One error of the backend's registry: a tag, its HTTP status, its `data`
 * schema and the metadata tools read (OpenAPI, retries). Built on v12's
 * `TrpcError.Tagged`, so the v12 runtime carries it as it is: its `code`
 * is its tag, its status the class's, and a thrown one keeps its `data`.
 * Under the proposal `code` goes and `_tag` is the error's only name.
 */
import { Predicate, Schema } from 'effect';
import {
  TrpcError,
  type AnySchema,
  type TaggedErrorClass,
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

/** A registry error's class: `new PostNotFound({ id })`, plus its spec. */
export type ErrorClass<
  TTag extends string,
  TSpec extends ErrorSpec,
> = TaggedErrorClass<TTag, TSpec['data'], TSpec['status'], TTag> & {
  readonly spec: TSpec;
};

/** Any registry error class. */
export interface AnyErrorClass {
  new (...args: any[]): TrpcError<string, any, string>;
  readonly tag: string;
  readonly spec: ErrorSpec;
}

/** A registry: error classes by tag. */
export type Registry = { readonly [tag: string]: AnyErrorClass };

/** The union of a registry's error instances. */
export type ErrorsOf<R> = {
  [K in keyof R]: R[K] extends abstract new (...args: any) => infer I
    ? I
    : never;
}[keyof R];

const valid = (schema: AnySchema, value: unknown): boolean => {
  if (Schema.isSchema(schema)) return Schema.is(schema)(value);
  const result = schema['~standard'].validate(value);
  return Predicate.isPromise(result) || result.issues === undefined;
};

/**
 * Makes one registry error. Its `data` is checked when it's made, so an
 * error thrown from a helper deep in the backend is as safe to send as a
 * returned one.
 */
export function defineError<
  const TTag extends string,
  const TSpec extends ErrorSpec,
>(tag: TTag, spec: TSpec): ErrorClass<TTag, TSpec> {
  const Base = TrpcError.Tagged(tag as string, {
    status: spec.status,
    data: spec.data,
    message: spec.message,
  }) as unknown as new (...args: unknown[]) => TrpcError<string, unknown>;
  const schema = spec.data;
  class RegistryError extends Base {
    static readonly spec = spec;
    constructor(...args: unknown[]) {
      if (schema !== undefined && !valid(schema, args[0])) {
        throw new TypeError(`${tag}: data doesn't match its schema`);
      }
      super(...args);
    }
  }
  return RegistryError as unknown as ErrorClass<TTag, TSpec>;
}

/** Classes from specs by tag: `createErrors()`'s and the framework's core. */
export const fromSpecs = <const M extends Record<string, ErrorSpec>>(
  specs: M,
): { readonly [K in keyof M & string]: ErrorClass<K, M[K]> } =>
  Object.fromEntries(
    Object.entries(specs).map(([tag, spec]) => [tag, defineError(tag, spec)]),
  ) as never;
