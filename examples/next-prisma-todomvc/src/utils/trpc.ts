import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';

/**
 * Typesafe hooks from your `AppRouter` type signature.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#5-create-trpc-hooks
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
