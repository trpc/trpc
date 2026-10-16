import { createTrpcContext } from '@trpcdev/tanstack-svelte-query';
import type { AppRouter, Links } from '../fixtures/app.ts';

export const { setTrpcContext, useTrpc, useTrpcClient } = createTrpcContext<
  AppRouter,
  {},
  Links
>();
