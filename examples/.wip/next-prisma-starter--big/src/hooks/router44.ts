import { createReactQueryHooks } from '@trpc/react';    
import type { Router44Router } from 'server/routers/router44';
const trpc = createReactQueryHooks<Router44Router>();

export const useRouter44Query = trpc.useQuery;
export const useRouter44InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter44Mutation = trpc.useMutation;
export const useRouter44Context = trpc.useContext;