/**
 * Shared types.
 */

import type { TRPCRequestOptions } from '@trpc/client'

/**
 * Additional tRPC options can appended to svelte-query options under a `tRPC` property.
 */
export type TRPCOptions = { trpc?: TRPCRequestOptions }

/**
 * Infinite queries must have the "cursor" property in the input.
 */
export type InfiniteQueryInput = { cursor?: unknown }
