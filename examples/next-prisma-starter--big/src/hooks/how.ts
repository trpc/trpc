import { createReactQueryHooks } from '@trpc/react';    
import type { HowRouter } from 'server/routers/how';
const trpc = createReactQueryHooks<HowRouter>();

export const useHowQuery = trpc.useQuery;
export const useHowInfiniteQuery = trpc.useInfiniteQuery;
export const useHowMutation = trpc.useMutation;
export const useHowContext = trpc.useContext;