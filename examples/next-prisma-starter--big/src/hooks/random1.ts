import { createReactQueryHooks } from '@trpc/react';    
import type { Random1Router } from 'server/routers/random1';
const trpc = createReactQueryHooks<Random1Router>();

export const useRandom1Query = trpc.useQuery;
export const useRandom1InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom1Mutation = trpc.useMutation;
export const useRandom1Context = trpc.useContext;