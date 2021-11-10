import { createReactQueryHooks } from '@trpc/react';    
import type { Random19Router } from 'server/routers/random19';
const trpc = createReactQueryHooks<Random19Router>();

export const useRandom19Query = trpc.useQuery;
export const useRandom19InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom19Mutation = trpc.useMutation;
export const useRandom19Context = trpc.useContext;