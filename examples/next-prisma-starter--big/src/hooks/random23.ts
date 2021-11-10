import { createReactQueryHooks } from '@trpc/react';    
import type { Random23Router } from 'server/routers/random23';
const trpc = createReactQueryHooks<Random23Router>();

export const useRandom23Query = trpc.useQuery;
export const useRandom23InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom23Mutation = trpc.useMutation;
export const useRandom23Context = trpc.useContext;