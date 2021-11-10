import { createReactQueryHooks } from '@trpc/react';    
import type { SweaterRouter } from 'server/routers/sweater';
const trpc = createReactQueryHooks<SweaterRouter>();

export const useSweaterQuery = trpc.useQuery;
export const useSweaterMutation = trpc.useMutation;