import { createReactQueryHooks } from '@trpc/react';    
import type { Random49Router } from 'server/routers/random49';
const trpc = createReactQueryHooks<Random49Router>();

export const useRandom49Query = trpc.useQuery;
export const useRandom49InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom49Mutation = trpc.useMutation;
export const useRandom49Context = trpc.useContext;