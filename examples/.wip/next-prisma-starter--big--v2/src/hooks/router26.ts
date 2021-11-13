import { createReactQueryHooks } from '@trpc/react';    
import type { Router26Router } from 'server/routers/router26';
const trpc = createReactQueryHooks<Router26Router>();

export const useRouter26Query = trpc.useQuery;
export const useRouter26InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter26Mutation = trpc.useMutation;
export const useRouter26Context = trpc.useContext;