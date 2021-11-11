import { createReactQueryHooks } from '@trpc/react';    
import type { Router47Router } from 'server/routers/router47';
const trpc = createReactQueryHooks<Router47Router>();

export const useRouter47Query = trpc.useQuery;
export const useRouter47InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter47Mutation = trpc.useMutation;
export const useRouter47Context = trpc.useContext;