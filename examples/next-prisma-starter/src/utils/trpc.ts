import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '~/server/routers/_app';

/**
 * A provider and a strongly-typed `useTRPC()` hook from your `AppRouter` type signature
 * @see https://trpc.io/docs/v11/client/nextjs/pages-router/setup#5-create-trpc-hooks
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
