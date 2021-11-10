import { createReactQueryHooks } from '@trpc/react';    
import type { Random47Router } from 'server/routers/random47';
const trpc = createReactQueryHooks<Random47Router>();

export const useRandom47Query = trpc.useQuery;
export const useRandom47InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom47Mutation = trpc.useMutation;
export const useRandom47Context = trpc.useContext;