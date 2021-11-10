import { createReactQueryHooks } from '@trpc/react';    
import type { WereRouter } from 'server/routers/were';
const trpc = createReactQueryHooks<WereRouter>();

export const useWereQuery = trpc.useQuery;
export const useWereInfiniteQuery = trpc.useInfiniteQuery;
export const useWereMutation = trpc.useMutation;
export const useWereContext = trpc.useContext;