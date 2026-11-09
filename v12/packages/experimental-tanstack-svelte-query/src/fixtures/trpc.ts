import { createTrpcContext } from '@trpc12/experimental-tanstack-svelte-query';
import type { AppClient } from '../../../tanstack-query/src/fixtures/app.ts';

export const [useTrpc, setTrpcContext, useTrpcClient] =
  createTrpcContext<AppClient>();
