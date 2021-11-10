import { createReactQueryHooks } from '@trpc/react';    
import type { Random39Router } from 'server/routers/random39';
const trpc = createReactQueryHooks<Random39Router>();

export const useRandom39Query = trpc.useQuery;
export const useRandom39InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom39Mutation = trpc.useMutation;
export const useRandom39Context = trpc.useContext;