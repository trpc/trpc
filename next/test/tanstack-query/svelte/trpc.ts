import { createTrpcContext } from '@trpcdev/tanstack-svelte-query';
import type { AppRouter } from '../fixtures/app.ts';

export const { setTrpcContext, useTrpc, useTrpcClient } =
  createTrpcContext<AppRouter>();
