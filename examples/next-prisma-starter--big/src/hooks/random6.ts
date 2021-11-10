import { createReactQueryHooks } from '@trpc/react';    
import type { Random6Router } from 'server/routers/random6';
const trpc = createReactQueryHooks<Random6Router>();

export const useRandom6Query = trpc.useQuery;
export const useRandom6InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom6Mutation = trpc.useMutation;
export const useRandom6Context = trpc.useContext;