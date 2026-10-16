import {
  defaultShouldDehydrateQuery,
  type DehydrateOptions,
  type HydrateOptions,
} from '@tanstack/query-core';
import { getClientSerializer } from 'trpcdev/client';
import {
  defaultSerializer,
  type AnySerializer,
  type SerializeReturn,
} from 'trpcdev/serializer';

/**
 * Options for {@link hydrationOptions}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HydrationOptionsOptions {
  /** The tRPC client whose links' serializer hydration uses. */
  client?: object | undefined;
  /**
   * Overrides the client's serializer. Must match on both ends.
   * @default the client's serializer, else defaultSerializer
   */
  serializer?: AnySerializer | undefined;
}

/**
 * `dehydrate`/`hydrate` defaults for a `QueryClient` that carry the types
 * the client's serializer keeps from a server render to the browser (with
 * the default, `Date`, `Map`, `BigInt`, …). Pending queries are dehydrated
 * too, so a server can stream them; their data is serialized once it
 * settles.
 *
 * @example
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: { ...hydrationOptions({ client }), queries: { staleTime: 30_000 } },
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function hydrationOptions(opts: HydrationOptionsOptions = {}): {
  dehydrate: DehydrateOptions;
  hydrate: NonNullable<HydrateOptions['defaultOptions']>;
} {
  const serializer =
    opts.serializer ??
    (opts.client ? getClientSerializer(opts.client) : undefined) ??
    defaultSerializer;
  return {
    dehydrate: {
      serializeData: (data: unknown) => serializer.serialize(data),
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    },
    hydrate: {
      deserializeData: (data: unknown) =>
        serializer.deserialize(data as SerializeReturn),
    },
  };
}
