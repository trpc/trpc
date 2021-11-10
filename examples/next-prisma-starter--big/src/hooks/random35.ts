import { createReactQueryHooks } from '@trpc/react';    
import type { Random35Router } from 'server/routers/random35';
const trpc = createReactQueryHooks<Random35Router>();

export const useRandom35Query = trpc.useQuery;
export const useRandom35InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom35Mutation = trpc.useMutation;
export const useRandom35Context = trpc.useContext;