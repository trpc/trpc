import { createReactQueryHooks } from '@trpc/react';    
import type { HelloRouter } from 'server/routers/hello';
const trpc = createReactQueryHooks<HelloRouter>();

export const useHelloQuery = trpc.useQuery;
export const useHelloInfiniteQuery = trpc.useInfiniteQuery;
export const useHelloMutation = trpc.useMutation;
export const useHelloContext = trpc.useContext;