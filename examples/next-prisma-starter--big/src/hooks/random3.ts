import { createReactQueryHooks } from '@trpc/react';    
import type { Random3Router } from 'server/routers/random3';
const trpc = createReactQueryHooks<Random3Router>();

export const useRandom3Query = trpc.useQuery;
export const useRandom3InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom3Mutation = trpc.useMutation;
export const useRandom3Context = trpc.useContext;