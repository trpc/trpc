import { createReactQueryHooks } from '@trpc/react';    
import type { SeatRouter } from 'server/routers/seat';
const trpc = createReactQueryHooks<SeatRouter>();

export const useSeatQuery = trpc.useQuery;
export const useSeatMutation = trpc.useMutation;