import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
