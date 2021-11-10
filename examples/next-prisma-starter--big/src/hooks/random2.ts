import { createReactQueryHooks } from '@trpc/react';    
import type { Random2Router } from 'server/routers/random2';
const trpc = createReactQueryHooks<Random2Router>();

export const useRandom2Query = trpc.useQuery;
export const useRandom2InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom2Mutation = trpc.useMutation;
export const useRandom2Context = trpc.useContext;