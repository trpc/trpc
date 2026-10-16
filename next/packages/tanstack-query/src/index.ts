/**
 * TanStack Query helpers for tRPC that work with every TanStack adapter.
 * They produce plain options objects. The framework packages
 * (`@trpcdev/tanstack-react-query`, `-preact-`, `-vue-`, `-solid-`,
 * `-svelte-`, `-angular-` and `-lit-query`) re-export them and add context
 * helpers and a subscription primitive.
 *
 * @example
 * ```ts
 * import { createTrpcQueryUtils } from '@trpcdev/tanstack-query';
 *
 * export const trpc = createTrpcQueryUtils({ client });
 *
 * useQuery(trpc.post.byId.queryOptions({ input: { id } }));
 * ```
 * @module
 */
export {
  createTrpcQueryUtils,
  type CreateTrpcQueryUtilsOptions,
  type InfiniteOptionsIn,
  type InfiniteOptionsOut,
  type MutationOptionsIn,
  type MutationOptionsOut,
  type MutationProcedureUtils,
  type MutationVariables,
  type PathUtils,
  type QueryData,
  type QueryFiltersIn,
  type QueryOptionsIn,
  type QueryOptionsOut,
  type QueryProcedureUtils,
  type StreamedMutationOptions,
  type StreamedOptions,
  type SubscriptionProcedureUtils,
  type SourceContext,
  type SourceLinks,
  type SourceRouter,
  type TrpcContextOptions,
  type TrpcQueryKeyFor,
  type TrpcQueryUtilsFor,
  type TrpcQueryUtils,
} from './utils.ts';
export {
  cacheTags,
  revalidationTag,
  type TrpcMutationKey,
  type TrpcQueryKey,
  type TrpcQueryKeyType,
} from './keys.ts';
export {
  SubscriptionCache,
  SubscriptionObserver,
  type SubscriptionCallbacks,
  type SubscriptionResult,
  type SubscriptionStatus,
  type TrpcSubscriptionOptions,
} from './subscription.ts';
export { hydrationOptions, type HydrationOptionsOptions } from './hydration.ts';
export { structuralSharing } from './sharing.ts';
