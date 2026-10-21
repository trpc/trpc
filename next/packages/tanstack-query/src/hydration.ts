import {
  defaultShouldDehydrateQuery,
  type DehydrateOptions,
  type HydrateOptions,
} from '@tanstack/query-core';
import { getClientSerializer } from '@trpc12/trpc/client';
import {
  jsonSerializer,
  type AnySerializer,
  type SerializeReturn,
} from '@trpc12/trpc/transformer';

/**
 * Options for {@link hydrationOptions}.
 * @since 0.1.0
 * @stability stable
 */
export interface HydrationOptionsOptions {
  /** The tRPC client whose links' serializer hydration uses. */
  client?: object | undefined;
  /**
   * Overrides the client's serializer. Must match on both ends.
   * @default the client's serializer, else jsonSerializer
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
 * @since 0.1.0
 * @stability stable
 */
export function hydrationOptions(opts: HydrationOptionsOptions = {}): {
  dehydrate: DehydrateOptions;
  hydrate: NonNullable<HydrateOptions['defaultOptions']>;
} {
  const serializer =
    opts.serializer ??
    (opts.client ? getClientSerializer(opts.client) : undefined) ??
    jsonSerializer;
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
