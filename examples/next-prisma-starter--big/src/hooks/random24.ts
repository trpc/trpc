import { createReactQueryHooks } from '@trpc/react';    
import type { Random24Router } from 'server/routers/random24';
const trpc = createReactQueryHooks<Random24Router>();

export const useRandom24Query = trpc.useQuery;
export const useRandom24InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom24Mutation = trpc.useMutation;
export const useRandom24Context = trpc.useContext;