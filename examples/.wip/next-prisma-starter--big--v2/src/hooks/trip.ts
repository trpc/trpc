import { createReactQueryHooks } from '@trpc/react';    
import type { TripRouter } from 'server/routers/trip';
const trpc = createReactQueryHooks<TripRouter>();

export const useTripQuery = trpc.useQuery;
export const useTripInfiniteQuery = trpc.useInfiniteQuery;
export const useTripMutation = trpc.useMutation;
export const useTripContext = trpc.useContext;