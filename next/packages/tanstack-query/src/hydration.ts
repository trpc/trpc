import {
  defaultShouldDehydrateQuery,
  type DehydrateOptions,
  type HydrateOptions,
} from '@tanstack/query-core';
import { getClientTransformer } from '@trpc12/trpc/client';
import {
  jsonTransformer,
  type AnyTransformer,
  type SerializeReturn,
} from '@trpc12/trpc/transformer';

/**
 * Options for {@link hydrationOptions}.
 * @since 0.1.0
 * @stability stable
 */
export interface HydrationOptionsOptions {
  /** The tRPC client whose links' transformer hydration uses. */
  client?: object | undefined;
  /**
   * Overrides the client's transformer. Must match on both ends.
   * @default the client's transformer, else jsonTransformer
   */
  transformer?: AnyTransformer | undefined;
}

/**
 * `dehydrate`/`hydrate` defaults for a `QueryClient` that carry the types
 * the client's transformer keeps from a server render to the browser (with
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
  const transformer =
    opts.transformer ??
    (opts.client ? getClientTransformer(opts.client) : undefined) ??
    jsonTransformer;
  return {
    dehydrate: {
      serializeData: (data: unknown) => transformer.serialize(data),
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    },
    hydrate: {
      deserializeData: (data: unknown) =>
        transformer.deserialize(data as SerializeReturn),
    },
  };
}
