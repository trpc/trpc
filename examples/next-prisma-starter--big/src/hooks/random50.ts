import { createReactQueryHooks } from '@trpc/react';    
import type { Random50Router } from 'server/routers/random50';
const trpc = createReactQueryHooks<Random50Router>();

export const useRandom50Query = trpc.useQuery;
export const useRandom50InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom50Mutation = trpc.useMutation;
export const useRandom50Context = trpc.useContext;