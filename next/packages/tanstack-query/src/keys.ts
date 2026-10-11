import { skipToken } from '@tanstack/query-core';

/**
 * What a query key was made by: `queryOptions` (`'query'`), `infiniteOptions`
 * (`'infinite'`), or a subscription's `streamedOptions`/`liveOptions`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TRPCQueryKeyType = 'query' | 'infinite' | 'streamed' | 'live';

/**
 * A tRPC query key: `[['post', 'byId'], { input, type }]`. The path is an
 * array so `[['post']]` partially matches every key under `post`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TRPCQueryKey = readonly [
  path: readonly string[],
  opts?: { input?: unknown; type?: TRPCQueryKeyType },
];

/**
 * A tRPC mutation key: `[['post', 'create']]`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TRPCMutationKey = readonly [path: readonly string[]];

/** @internal */
export function procedureKey(
  path: readonly string[],
  input: unknown,
  type: TRPCQueryKeyType | undefined,
): TRPCQueryKey {
  return [
    path,
    {
      ...(input === undefined || input === skipToken ? {} : { input }),
      ...(type ? { type } : {}),
    },
  ];
}

/** @internal */
export function pathKey(path: readonly string[]): TRPCQueryKey {
  return [path];
}
