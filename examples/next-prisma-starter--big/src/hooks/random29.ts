import { createReactQueryHooks } from '@trpc/react';    
import type { Random29Router } from 'server/routers/random29';
const trpc = createReactQueryHooks<Random29Router>();

export const useRandom29Query = trpc.useQuery;
export const useRandom29InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom29Mutation = trpc.useMutation;
export const useRandom29Context = trpc.useContext;