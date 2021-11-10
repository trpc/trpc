import { createReactQueryHooks } from '@trpc/react';    
import type { Random26Router } from 'server/routers/random26';
const trpc = createReactQueryHooks<Random26Router>();

export const useRandom26Query = trpc.useQuery;
export const useRandom26InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom26Mutation = trpc.useMutation;
export const useRandom26Context = trpc.useContext;