import { createReactQueryHooks } from '@trpc/react';    
import type { Random18Router } from 'server/routers/random18';
const trpc = createReactQueryHooks<Random18Router>();

export const useRandom18Query = trpc.useQuery;
export const useRandom18InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom18Mutation = trpc.useMutation;
export const useRandom18Context = trpc.useContext;