import type { TRPCClientError } from './TRPCClientError';

/**
 * @internal
 */
export declare const errorShapeTag: unique symbol;

/**
 * The promise a client's `.query()` or `.mutate()` returns, tagged with
 * the procedure's error shape for `safe()`.
 */
export type TRPCTaggedPromise<TData, TErrorShape> = Promise<TData> & {
  readonly [errorShapeTag]: TErrorShape;
};

/**
 * @internal
 */
export type inferSafeError<TErrorShape> = TRPCClientError<{
  errorShape: TErrorShape;
  transformer: boolean;
}>;

/**
 * What `safe()` resolves to: `[data, undefined]` or `[undefined, error]`.
 * @see https://trpc.io/docs/client/vanilla/error-handling#errors-as-values-with-safe
 */
export type SafeResult<TData, TErrorShape> =
  | readonly [data: TData, error: undefined]
  | readonly [data: undefined, error: inferSafeError<TErrorShape>];

/**
 * Awaits a client `.query()` or `.mutate()` call without throwing, and
 * returns a `[data, error]` pair typed with the procedure's error shape.
 *
 * @example
 * ```ts
 * const [post, error] = await safe(client.post.byId.query({ id }));
 * if (error) {
 *   console.error(error);
 * }
 *
 * const id = post.id;
 * ```
 * @see https://trpc.io/docs/client/vanilla/error-handling#errors-as-values-with-safe
 */
export async function safe<TData, TErrorShape>(
  promise: TRPCTaggedPromise<TData, TErrorShape>,
): Promise<SafeResult<TData, TErrorShape>> {
  try {
    return [await promise, undefined];
  } catch (cause) {
    return [undefined, cause as inferSafeError<TErrorShape>];
  }
}
