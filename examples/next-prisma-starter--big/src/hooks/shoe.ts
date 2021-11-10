import { createReactQueryHooks } from '@trpc/react';    
import type { ShoeRouter } from 'server/routers/shoe';
const trpc = createReactQueryHooks<ShoeRouter>();

export const useShoeQuery = trpc.useQuery;
export const useShoeMutation = trpc.useMutation;