import { createReactQueryHooks } from '@trpc/react';    
import type { RouterRouter } from 'server/routers/router';
const trpc = createReactQueryHooks<RouterRouter>();

export const useRouterQuery = trpc.useQuery;
export const useRouterInfiniteQuery = trpc.useInfiniteQuery;
export const useRouterMutation = trpc.useMutation;
export const useRouterContext = trpc.useContext;