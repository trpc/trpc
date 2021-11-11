import { createReactQueryHooks } from '@trpc/react';    
import type { Router49Router } from 'server/routers/router49';
const trpc = createReactQueryHooks<Router49Router>();

export const useRouter49Query = trpc.useQuery;
export const useRouter49InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter49Mutation = trpc.useMutation;
export const useRouter49Context = trpc.useContext;