import { skipToken } from '@tanstack/query-core';

/**
 * What a query key was made by: `queryOptions` (`'query'`), `infiniteOptions`
 * (`'infinite'`), a subscription's `streamedOptions`/`liveOptions`, or the
 * chunks of a `streamedMutationOptions` mutation (`'mutation'`).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcQueryKeyType =
  | 'query'
  | 'infinite'
  | 'streamed'
  | 'live'
  | 'mutation';

/**
 * A tRPC query key: `[['post', 'byId'], { input, type }]`. The path is an
 * array so `[['post']]` partially matches every key under `post`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcQueryKey = readonly [
  path: readonly string[],
  opts?: { input?: unknown; type?: TrpcQueryKeyType },
];

/**
 * A tRPC mutation key: `[['post', 'create']]`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcMutationKey = readonly [path: readonly string[]];

/** @internal */
export function procedureKey(
  path: readonly string[],
  input: unknown,
  type: TrpcQueryKeyType | undefined,
): TrpcQueryKey {
  return [
    path,
    {
      ...(input === undefined || input === skipToken ? {} : { input }),
      ...(type ? { type } : {}),
    },
  ];
}

/** @internal */
export function pathKey(path: readonly string[]): TrpcQueryKey {
  return [path];
}
