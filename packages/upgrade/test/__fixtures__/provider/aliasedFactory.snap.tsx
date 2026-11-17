import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './basic.trpc';

// The setup migrates when the factory is imported under another name
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
