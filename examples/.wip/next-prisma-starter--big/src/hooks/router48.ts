import { createReactQueryHooks } from '@trpc/react';    
import type { Router48Router } from 'server/routers/router48';
const trpc = createReactQueryHooks<Router48Router>();

export const useRouter48Query = trpc.useQuery;
export const useRouter48InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter48Mutation = trpc.useMutation;
export const useRouter48Context = trpc.useContext;