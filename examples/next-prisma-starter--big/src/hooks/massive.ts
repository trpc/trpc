import { createReactQueryHooks } from '@trpc/react';    
import type { MassiveRouter } from 'server/routers/massive';
const trpc = createReactQueryHooks<MassiveRouter>();

export const useMassiveQuery = trpc.useQuery;
export const useMassiveInfiniteQuery = trpc.useInfiniteQuery;
export const useMassiveMutation = trpc.useMutation;
export const useMassiveContext = trpc.useContext;