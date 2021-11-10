import { createReactQueryHooks } from '@trpc/react';    
import type { WeRouter } from 'server/routers/we';
const trpc = createReactQueryHooks<WeRouter>();

export const useWeQuery = trpc.useQuery;
export const useWeInfiniteQuery = trpc.useInfiniteQuery;
export const useWeMutation = trpc.useMutation;
export const useWeContext = trpc.useContext;