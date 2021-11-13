import { createReactQueryHooks } from '@trpc/react';    
import type { Router42Router } from 'server/routers/router42';
const trpc = createReactQueryHooks<Router42Router>();

export const useRouter42Query = trpc.useQuery;
export const useRouter42InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter42Mutation = trpc.useMutation;
export const useRouter42Context = trpc.useContext;