import { createReactQueryHooks } from '@trpc/react';    
import type { You?Router } from 'server/routers/you?';
const trpc = createReactQueryHooks<You?Router>();

export const useYou?Query = trpc.useQuery;
export const useYou?InfiniteQuery = trpc.useInfiniteQuery;
export const useYou?Mutation = trpc.useMutation;
export const useYou?Context = trpc.useContext;