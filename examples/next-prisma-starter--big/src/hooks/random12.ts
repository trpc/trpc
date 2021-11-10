import { createReactQueryHooks } from '@trpc/react';    
import type { Random12Router } from 'server/routers/random12';
const trpc = createReactQueryHooks<Random12Router>();

export const useRandom12Query = trpc.useQuery;
export const useRandom12InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom12Mutation = trpc.useMutation;
export const useRandom12Context = trpc.useContext;