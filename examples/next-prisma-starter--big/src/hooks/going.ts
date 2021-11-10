import { createReactQueryHooks } from '@trpc/react';    
import type { GoingRouter } from 'server/routers/going';
const trpc = createReactQueryHooks<GoingRouter>();

export const useGoingQuery = trpc.useQuery;
export const useGoingInfiniteQuery = trpc.useInfiniteQuery;
export const useGoingMutation = trpc.useMutation;
export const useGoingContext = trpc.useContext;