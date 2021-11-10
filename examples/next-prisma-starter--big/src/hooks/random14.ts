import { createReactQueryHooks } from '@trpc/react';    
import type { Random14Router } from 'server/routers/random14';
const trpc = createReactQueryHooks<Random14Router>();

export const useRandom14Query = trpc.useQuery;
export const useRandom14InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom14Mutation = trpc.useMutation;
export const useRandom14Context = trpc.useContext;