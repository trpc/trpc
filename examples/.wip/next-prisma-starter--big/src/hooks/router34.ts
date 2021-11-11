import { createReactQueryHooks } from '@trpc/react';    
import type { Router34Router } from 'server/routers/router34';
const trpc = createReactQueryHooks<Router34Router>();

export const useRouter34Query = trpc.useQuery;
export const useRouter34InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter34Mutation = trpc.useMutation;
export const useRouter34Context = trpc.useContext;