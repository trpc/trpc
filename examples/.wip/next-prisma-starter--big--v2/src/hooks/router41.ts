import { createReactQueryHooks } from '@trpc/react';    
import type { Router41Router } from 'server/routers/router41';
const trpc = createReactQueryHooks<Router41Router>();

export const useRouter41Query = trpc.useQuery;
export const useRouter41InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter41Mutation = trpc.useMutation;
export const useRouter41Context = trpc.useContext;