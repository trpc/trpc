import { createReactQueryHooks } from '@trpc/react';    
import type { Random42Router } from 'server/routers/random42';
const trpc = createReactQueryHooks<Random42Router>();

export const useRandom42Query = trpc.useQuery;
export const useRandom42InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom42Mutation = trpc.useMutation;
export const useRandom42Context = trpc.useContext;