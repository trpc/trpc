import { createReactQueryHooks } from '@trpc/react';    
import type { Router40Router } from 'server/routers/router40';
const trpc = createReactQueryHooks<Router40Router>();

export const useRouter40Query = trpc.useQuery;
export const useRouter40InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter40Mutation = trpc.useMutation;
export const useRouter40Context = trpc.useContext;