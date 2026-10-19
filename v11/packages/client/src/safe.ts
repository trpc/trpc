import type { TRPCClientError } from './TRPCClientError';

/**
 * @internal
 */
export declare const errorShapeTag: unique symbol;

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

export type SafeResult<TData, TErrorShape> =
  | readonly [data: TData, error: undefined]
  | readonly [data: undefined, error: inferSafeError<TErrorShape>];

/**
 * Await a vanilla client `query()` or `mutate()` call without it throwing, getting back a
 * `[data, error]` pair typed with that procedure's error shape.
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
