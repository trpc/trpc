import { createReactQueryHooks } from '@trpc/react';    
import type { ARouter } from 'server/routers/a';
const trpc = createReactQueryHooks<ARouter>();

export const useAQuery = trpc.useQuery;
export const useAInfiniteQuery = trpc.useInfiniteQuery;
export const useAMutation = trpc.useMutation;
export const useAContext = trpc.useContext;