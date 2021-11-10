import { createReactQueryHooks } from '@trpc/react';    
import type { ThereRouter } from 'server/routers/there';
const trpc = createReactQueryHooks<ThereRouter>();

export const useThereQuery = trpc.useQuery;
export const useThereInfiniteQuery = trpc.useInfiniteQuery;
export const useThereMutation = trpc.useMutation;
export const useThereContext = trpc.useContext;