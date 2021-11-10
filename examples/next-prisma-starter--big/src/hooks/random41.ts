import { createReactQueryHooks } from '@trpc/react';    
import type { Random41Router } from 'server/routers/random41';
const trpc = createReactQueryHooks<Random41Router>();

export const useRandom41Query = trpc.useQuery;
export const useRandom41InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom41Mutation = trpc.useMutation;
export const useRandom41Context = trpc.useContext;