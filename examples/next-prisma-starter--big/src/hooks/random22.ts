import { createReactQueryHooks } from '@trpc/react';    
import type { Random22Router } from 'server/routers/random22';
const trpc = createReactQueryHooks<Random22Router>();

export const useRandom22Query = trpc.useQuery;
export const useRandom22InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom22Mutation = trpc.useMutation;
export const useRandom22Context = trpc.useContext;