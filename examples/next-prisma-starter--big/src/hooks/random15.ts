import { createReactQueryHooks } from '@trpc/react';    
import type { Random15Router } from 'server/routers/random15';
const trpc = createReactQueryHooks<Random15Router>();

export const useRandom15Query = trpc.useQuery;
export const useRandom15InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom15Mutation = trpc.useMutation;
export const useRandom15Context = trpc.useContext;