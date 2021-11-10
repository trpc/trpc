import { createReactQueryHooks } from '@trpc/react';    
import type { Random40Router } from 'server/routers/random40';
const trpc = createReactQueryHooks<Random40Router>();

export const useRandom40Query = trpc.useQuery;
export const useRandom40InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom40Mutation = trpc.useMutation;
export const useRandom40Context = trpc.useContext;