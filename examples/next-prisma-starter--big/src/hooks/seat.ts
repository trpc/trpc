import { createReactQueryHooks } from '@trpc/react';    
import type { SeatRouter } from 'server/routers/seat';
const trpc = createReactQueryHooks<SeatRouter>();

export const useSeatQuery = trpc.useQuery;
export const useSeatInfiniteQuery = trpc.useInfiniteQuery;
export const useSeatMutation = trpc.useMutation;
export const useSeatContext = trpc.useContext;