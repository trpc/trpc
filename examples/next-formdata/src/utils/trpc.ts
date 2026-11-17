import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
