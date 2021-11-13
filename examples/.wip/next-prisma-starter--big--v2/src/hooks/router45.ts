import { createReactQueryHooks } from '@trpc/react';    
import type { Router45Router } from 'server/routers/router45';
const trpc = createReactQueryHooks<Router45Router>();

export const useRouter45Query = trpc.useQuery;
export const useRouter45InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter45Mutation = trpc.useMutation;
export const useRouter45Context = trpc.useContext;