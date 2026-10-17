import { createTrpcContext } from '@trpc12/tanstack-svelte-query';
import type { AppClient } from '../../../packages/tanstack-query/src/fixtures/app.ts';

export const [useTrpc, setTrpcContext, useTrpcClient] =
  createTrpcContext<AppClient>();
