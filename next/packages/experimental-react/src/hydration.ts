import { getClientTransformer } from '@trpc12/trpc/client';
import {
  jsonTransformer,
  type AnyTransformer,
  type SerializeReturn,
} from '@trpc12/trpc/transformer';
import type { QueryStore } from './store.ts';

/**
 * Settled query data, encoded for a server render to send to the browser.
 * @since 0.1.0
 * @stability experimental
 */
export interface DehydratedQueries {
  readonly queries: ReadonlyArray<{
    readonly path: string;
    readonly input: SerializeReturn | null;
    readonly data: SerializeReturn;
    readonly updatedAt: number;
  }>;
}

/**
 * Options for {@link dehydrate} and {@link hydrate}.
 * @since 0.1.0
 * @stability experimental
 */
export interface HydrationOptions {
  /**
   * How inputs and data are encoded. Must match on both ends.
   * @default the client's serializer, else jsonTransformer
   */
  serializer?: AnyTransformer | undefined;
}

interface HasStore {
  readonly store: QueryStore;
  readonly client: object;
}

const transformerOf = (trpc: HasStore, opts: HydrationOptions) =>
  opts.serializer ?? getClientTransformer(trpc.client) ?? jsonTransformer;

/**
 * Encodes every query with data, with the client's serializer, so `Date`s
 * and `Map`s survive with danSON. Pending and failed queries are left out:
 * the browser runs them.
 *
 * @example
 * ```ts
 * const state = dehydrate(trpc); // after the server render
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function dehydrate(
  trpc: HasStore,
  opts: HydrationOptions = {},
): DehydratedQueries {
  const serializer = transformerOf(trpc, opts);
  return {
    queries: trpc.store.entries().flatMap((entry) =>
      entry.hasData
        ? [
            {
              path: entry.path,
              input:
                entry.input === undefined
                  ? null
                  : serializer.serialize(entry.input),
              data: serializer.serialize(entry.data),
              updatedAt: entry.snapshot.updatedAt,
            },
          ]
        : [],
    ),
  };
}

/**
 * Writes dehydrated queries into a client's cache. A query the cache has
 * newer data for keeps it.
 *
 * @example
 * ```ts
 * hydrate(trpc, window.__TRPC_STATE__);
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function hydrate(
  trpc: HasStore,
  state: DehydratedQueries,
  opts: HydrationOptions = {},
): void {
  const serializer = transformerOf(trpc, opts);
  for (const query of state.queries) {
    trpc.store.seed(
      query.path,
      query.input === null ? undefined : serializer.deserialize(query.input),
      serializer.deserialize(query.data),
      query.updatedAt,
    );
  }
}
