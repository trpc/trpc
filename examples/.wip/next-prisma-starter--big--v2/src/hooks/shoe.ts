import { createReactQueryHooks } from '@trpc/react';    
import type { ShoeRouter } from 'server/routers/shoe';
const trpc = createReactQueryHooks<ShoeRouter>();

export const useShoeQuery = trpc.useQuery;
export const useShoeInfiniteQuery = trpc.useInfiniteQuery;
export const useShoeMutation = trpc.useMutation;
export const useShoeContext = trpc.useContext;