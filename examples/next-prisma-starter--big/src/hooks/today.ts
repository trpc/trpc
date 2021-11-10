import { createReactQueryHooks } from '@trpc/react';    
import type { TodayRouter } from 'server/routers/today';
const trpc = createReactQueryHooks<TodayRouter>();

export const useTodayQuery = trpc.useQuery;
export const useTodayInfiniteQuery = trpc.useInfiniteQuery;
export const useTodayMutation = trpc.useMutation;
export const useTodayContext = trpc.useContext;