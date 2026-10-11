import { createTRPCContext } from '@trpcdev/tanstack-svelte-query';
import type { AppRouter } from '../fixtures/app.ts';

export const { setTRPCContext, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
