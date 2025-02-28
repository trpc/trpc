import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { TRPCRouter } from './router';

export const { TRPCProvider, useTRPC } = createTRPCContext<TRPCRouter>();
