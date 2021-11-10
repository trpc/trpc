import { createReactQueryHooks } from '@trpc/react';    
import type { Random17Router } from 'server/routers/random17';
const trpc = createReactQueryHooks<Random17Router>();

export const useRandom17Query = trpc.useQuery;
export const useRandom17InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom17Mutation = trpc.useMutation;
export const useRandom17Context = trpc.useContext;