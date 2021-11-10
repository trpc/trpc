import { createReactQueryHooks } from '@trpc/react';    
import type { FlightRouter } from 'server/routers/flight';
const trpc = createReactQueryHooks<FlightRouter>();

export const useFlightQuery = trpc.useQuery;
export const useFlightMutation = trpc.useMutation;