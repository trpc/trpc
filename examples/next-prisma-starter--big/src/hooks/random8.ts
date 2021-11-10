import { createReactQueryHooks } from '@trpc/react';    
import type { Random8Router } from 'server/routers/random8';
const trpc = createReactQueryHooks<Random8Router>();

export const useRandom8Query = trpc.useQuery;
export const useRandom8InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom8Mutation = trpc.useMutation;
export const useRandom8Context = trpc.useContext;