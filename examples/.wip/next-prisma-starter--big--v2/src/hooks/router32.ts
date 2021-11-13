import { createReactQueryHooks } from '@trpc/react';    
import type { Router32Router } from 'server/routers/router32';
const trpc = createReactQueryHooks<Router32Router>();

export const useRouter32Query = trpc.useQuery;
export const useRouter32InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter32Mutation = trpc.useMutation;
export const useRouter32Context = trpc.useContext;