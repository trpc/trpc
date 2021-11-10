import { createReactQueryHooks } from '@trpc/react';    
import type { Random36Router } from 'server/routers/random36';
const trpc = createReactQueryHooks<Random36Router>();

export const useRandom36Query = trpc.useQuery;
export const useRandom36InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom36Mutation = trpc.useMutation;
export const useRandom36Context = trpc.useContext;