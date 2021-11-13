import { createReactQueryHooks } from '@trpc/react';    
import type { FlightRouter } from 'server/routers/flight';
const trpc = createReactQueryHooks<FlightRouter>();

export const useFlightQuery = trpc.useQuery;
export const useFlightInfiniteQuery = trpc.useInfiniteQuery;
export const useFlightMutation = trpc.useMutation;
export const useFlightContext = trpc.useContext;