import { createReactQueryHooks } from '@trpc/react';    
import type { Random32Router } from 'server/routers/random32';
const trpc = createReactQueryHooks<Random32Router>();

export const useRandom32Query = trpc.useQuery;
export const useRandom32InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom32Mutation = trpc.useMutation;
export const useRandom32Context = trpc.useContext;