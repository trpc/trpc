/**
 * TanStack Query helpers for tRPC that work with every TanStack adapter.
 * They produce plain options objects; the framework subpaths (`/react`,
 * `/preact`, `/vue`, `/solid`, `/svelte`, `/angular`, `/lit`) add context
 * helpers and a subscription primitive.
 *
 * @example
 * ```ts
 * import { createTRPCQueryUtils } from '@trpcdev/tanstack-query';
 *
 * export const trpc = createTRPCQueryUtils({ client });
 *
 * useQuery(trpc.post.byId.queryOptions({ input: { id } }));
 * ```
 * @module
 */
export {
  createTRPCQueryUtils,
  type CreateTRPCQueryUtilsOptions,
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
  type StreamedOptions,
  type SubscriptionProcedureUtils,
  type TRPCQueryKeyFor,
  type TRPCQueryUtilsFor,
  type TRPCQueryUtils,
} from './utils.ts';
export type {
  TRPCMutationKey,
  TRPCQueryKey,
  TRPCQueryKeyType,
} from './keys.ts';
export {
  SubscriptionObserver,
  type SubscriptionCallbacks,
  type SubscriptionResult,
  type SubscriptionStatus,
  type TRPCSubscriptionOptions,
} from './subscription.ts';
export { hydrationOptions, type HydrationOptionsOptions } from './hydration.ts';
