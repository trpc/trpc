import {
  defaultShouldDehydrateQuery,
  type DehydrateOptions,
  type HydrateOptions,
} from '@tanstack/query-core';
import { defaultSerializer, type Serializer } from 'trpcdev/serializer';

/**
 * Options for {@link hydrationOptions}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HydrationOptionsOptions {
  /** Must match the serializer's types on both ends. @default defaultSerializer */
  serializer?: Serializer | undefined;
}

/**
 * `dehydrate`/`hydrate` defaults for a `QueryClient` that carry rich types
 * (`Date`, `Map`, `BigInt`, …) from a server render to the browser. Pending
 * queries are dehydrated too, so a server can stream them.
 *
 * @example
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: { ...hydrationOptions(), queries: { staleTime: 30_000 } },
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function hydrationOptions(opts: HydrationOptionsOptions = {}): {
  dehydrate: DehydrateOptions;
  hydrate: NonNullable<HydrateOptions['defaultOptions']>;
} {
  const serializer = opts.serializer ?? defaultSerializer;
  return {
    dehydrate: {
      serializeData: (data: unknown) => serializer.serialize(data),
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    },
    hydrate: {
      deserializeData: (data: unknown) =>
        serializer.deserialize(data as ReturnType<Serializer['serialize']>),
    },
  };
}
