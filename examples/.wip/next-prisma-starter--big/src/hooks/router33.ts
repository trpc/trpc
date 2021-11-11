import { createReactQueryHooks } from '@trpc/react';    
import type { Router33Router } from 'server/routers/router33';
const trpc = createReactQueryHooks<Router33Router>();

export const useRouter33Query = trpc.useQuery;
export const useRouter33InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter33Mutation = trpc.useMutation;
export const useRouter33Context = trpc.useContext;