import { createReactQueryHooks } from '@trpc/react';    
import type { Random0Router } from 'server/routers/random0';
const trpc = createReactQueryHooks<Random0Router>();

export const useRandom0Query = trpc.useQuery;
export const useRandom0InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom0Mutation = trpc.useMutation;
export const useRandom0Context = trpc.useContext;