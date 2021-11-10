import { createReactQueryHooks } from '@trpc/react';    
import type { ThingRouter } from 'server/routers/thing';
const trpc = createReactQueryHooks<ThingRouter>();

export const useThingQuery = trpc.useQuery;
export const useThingMutation = trpc.useMutation;
export const useThingContext = trpc.useContext;