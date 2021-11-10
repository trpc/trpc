import { createReactQueryHooks } from '@trpc/react';    
import type { AreRouter } from 'server/routers/are';
const trpc = createReactQueryHooks<AreRouter>();

export const useAreQuery = trpc.useQuery;
export const useAreInfiniteQuery = trpc.useInfiniteQuery;
export const useAreMutation = trpc.useMutation;
export const useAreContext = trpc.useContext;