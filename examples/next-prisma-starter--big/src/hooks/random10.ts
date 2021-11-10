import { createReactQueryHooks } from '@trpc/react';    
import type { Random10Router } from 'server/routers/random10';
const trpc = createReactQueryHooks<Random10Router>();

export const useRandom10Query = trpc.useQuery;
export const useRandom10InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom10Mutation = trpc.useMutation;
export const useRandom10Context = trpc.useContext;