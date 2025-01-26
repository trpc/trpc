import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../server';

export type { AppRouter };
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
