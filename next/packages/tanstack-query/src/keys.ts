import { hashKey, skipToken } from '@tanstack/query-core';

/**
 * What a query key was made by: `queryOptions` (`'query'`), `infiniteOptions`
 * (`'infinite'`), a subscription's `streamedOptions`/`liveOptions`, or the
 * chunks of a `streamedMutationOptions` mutation (`'mutation'`).
 * @since 0.1.0
 * @stability stable
 */
export type TrpcQueryKeyType =
  'query' | 'infinite' | 'streamed' | 'live' | 'mutation';

/**
 * A tRPC query key: `[['post', 'byId'], { input, type }]`. The path is an
 * array so `[['post']]` partially matches every key under `post`.
 * @since 0.1.0
 * @stability stable
 */
export type TrpcQueryKey = readonly [
  path: readonly string[],
  opts?: { input?: unknown; type?: TrpcQueryKeyType },
];

/**
 * A tRPC mutation key: `[['post', 'create']]`.
 * @since 0.1.0
 * @stability stable
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

/** Next.js rejects longer tags. */
const MAX_TAG_LENGTH = 256;

const pathTag = (path: readonly string[]) =>
  path.length === 0 ? 'trpc' : `trpc:${path.join('.')}`;

const inputTag = (key: TrpcQueryKey): string | undefined => {
  const input = key[1]?.input;
  if (input === undefined || input === skipToken) return undefined;
  const tag = `${pathTag(key[0])}:${hashKey([input]).slice(1, -1)}`;
  return tag.length > MAX_TAG_LENGTH ? undefined : tag;
};

/**
 * Data-cache tags for a query key, broad to narrow: `trpc`, each path
 * prefix (`trpc:post`, `trpc:post.byId`), then the path with its input
 * (`trpc:post.byId:{"id":"1"}`, object keys sorted). Tag a Next.js
 * `'use cache'` function with all of them; {@link revalidationTag} picks
 * the one to revalidate. An input too long for a tag is left out, so it
 * revalidates with its path.
 *
 * @example
 * ```ts
 * async function getPost(id: string) {
 *   'use cache';
 *   cacheTag(...cacheTags(trpc.post.byId.queryKey({ input: { id } })));
 *   return caller.post.byId({ id });
 * }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function cacheTags(key: TrpcQueryKey): string[] {
  const path = key[0];
  const tags = ['trpc'];
  for (let i = 1; i <= path.length; i++) tags.push(pathTag(path.slice(0, i)));
  const own = inputTag(key);
  if (own !== undefined) tags.push(own);
  return tags;
}

/**
 * The tag that revalidates everything a key covers: a path key's
 * (`trpc.post.pathKey()` covers every `post.*` call), or a query key's own
 * input. Pairs with {@link cacheTags}.
 *
 * @example
 * ```ts
 * revalidateTag(revalidationTag(trpc.post.pathKey()));
 * revalidateTag(revalidationTag(trpc.post.byId.queryKey({ input: { id } })));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function revalidationTag(key: TrpcQueryKey): string {
  return inputTag(key) ?? pathTag(key[0]);
}
