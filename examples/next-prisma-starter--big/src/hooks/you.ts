import { createReactQueryHooks } from '@trpc/react';    
import type { YouRouter } from 'server/routers/you';
const trpc = createReactQueryHooks<YouRouter>();

export const useYouQuery = trpc.useQuery;
export const useYouInfiniteQuery = trpc.useInfiniteQuery;
export const useYouMutation = trpc.useMutation;
export const useYouContext = trpc.useContext;