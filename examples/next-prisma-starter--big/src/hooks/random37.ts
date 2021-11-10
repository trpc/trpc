import { createReactQueryHooks } from '@trpc/react';    
import type { Random37Router } from 'server/routers/random37';
const trpc = createReactQueryHooks<Random37Router>();

export const useRandom37Query = trpc.useQuery;
export const useRandom37InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom37Mutation = trpc.useMutation;
export const useRandom37Context = trpc.useContext;