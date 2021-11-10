import { createReactQueryHooks } from '@trpc/react';    
import type { Random20Router } from 'server/routers/random20';
const trpc = createReactQueryHooks<Random20Router>();

export const useRandom20Query = trpc.useQuery;
export const useRandom20InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom20Mutation = trpc.useMutation;
export const useRandom20Context = trpc.useContext;