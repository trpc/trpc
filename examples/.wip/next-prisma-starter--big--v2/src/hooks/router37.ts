import { createReactQueryHooks } from '@trpc/react';    
import type { Router37Router } from 'server/routers/router37';
const trpc = createReactQueryHooks<Router37Router>();

export const useRouter37Query = trpc.useQuery;
export const useRouter37InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter37Mutation = trpc.useMutation;
export const useRouter37Context = trpc.useContext;