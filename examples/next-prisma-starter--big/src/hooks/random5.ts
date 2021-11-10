import { createReactQueryHooks } from '@trpc/react';    
import type { Random5Router } from 'server/routers/random5';
const trpc = createReactQueryHooks<Random5Router>();

export const useRandom5Query = trpc.useQuery;
export const useRandom5InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom5Mutation = trpc.useMutation;
export const useRandom5Context = trpc.useContext;