import { createReactQueryHooks } from '@trpc/react';    
import type { ToRouter } from 'server/routers/to';
const trpc = createReactQueryHooks<ToRouter>();

export const useToQuery = trpc.useQuery;
export const useToInfiniteQuery = trpc.useInfiniteQuery;
export const useToMutation = trpc.useMutation;
export const useToContext = trpc.useContext;