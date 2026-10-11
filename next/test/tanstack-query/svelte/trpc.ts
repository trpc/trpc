import { createTRPCContext } from '@trpcdev/tanstack-query/svelte';
import type { AppRouter } from '../fixtures/app.ts';

export const { setTRPCContext, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
