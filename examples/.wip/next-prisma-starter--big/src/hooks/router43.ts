import { createReactQueryHooks } from '@trpc/react';    
import type { Router43Router } from 'server/routers/router43';
const trpc = createReactQueryHooks<Router43Router>();

export const useRouter43Query = trpc.useQuery;
export const useRouter43InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter43Mutation = trpc.useMutation;
export const useRouter43Context = trpc.useContext;