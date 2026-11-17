import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~/server/routers/_app';

/**
 * A provider and a `useTRPC` hook from your `AppRouter` type signature.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#5-create-trpc-hooks
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = RouterOutputs['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
