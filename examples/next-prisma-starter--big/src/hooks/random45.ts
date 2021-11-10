import { createReactQueryHooks } from '@trpc/react';    
import type { Random45Router } from 'server/routers/random45';
const trpc = createReactQueryHooks<Random45Router>();

export const useRandom45Query = trpc.useQuery;
export const useRandom45InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom45Mutation = trpc.useMutation;
export const useRandom45Context = trpc.useContext;