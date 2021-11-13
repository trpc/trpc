import { createReactQueryHooks } from '@trpc/react';    
import type { Router35Router } from 'server/routers/router35';
const trpc = createReactQueryHooks<Router35Router>();

export const useRouter35Query = trpc.useQuery;
export const useRouter35InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter35Mutation = trpc.useMutation;
export const useRouter35Context = trpc.useContext;