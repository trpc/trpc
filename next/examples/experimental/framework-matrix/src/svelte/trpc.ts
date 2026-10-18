import { createTrpcContext } from '@trpc12/tanstack-svelte-query';
import type { makeClient } from '../trpc.ts';

export const [useTrpc, setTrpcContext] = createTrpcContext<typeof makeClient>();
