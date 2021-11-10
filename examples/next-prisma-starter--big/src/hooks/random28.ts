import { createReactQueryHooks } from '@trpc/react';    
import type { Random28Router } from 'server/routers/random28';
const trpc = createReactQueryHooks<Random28Router>();

export const useRandom28Query = trpc.useQuery;
export const useRandom28InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom28Mutation = trpc.useMutation;
export const useRandom28Context = trpc.useContext;