import { createReactQueryHooks } from '@trpc/react';    
import type { Router46Router } from 'server/routers/router46';
const trpc = createReactQueryHooks<Router46Router>();

export const useRouter46Query = trpc.useQuery;
export const useRouter46InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter46Mutation = trpc.useMutation;
export const useRouter46Context = trpc.useContext;