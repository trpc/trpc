import { createReactQueryHooks } from '@trpc/react';    
import type { Random25Router } from 'server/routers/random25';
const trpc = createReactQueryHooks<Random25Router>();

export const useRandom25Query = trpc.useQuery;
export const useRandom25InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom25Mutation = trpc.useMutation;
export const useRandom25Context = trpc.useContext;