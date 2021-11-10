import { createReactQueryHooks } from '@trpc/react';    
import type { Random16Router } from 'server/routers/random16';
const trpc = createReactQueryHooks<Random16Router>();

export const useRandom16Query = trpc.useQuery;
export const useRandom16InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom16Mutation = trpc.useMutation;
export const useRandom16Context = trpc.useContext;