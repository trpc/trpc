import { createReactQueryHooks } from '@trpc/react';    
import type { Router28Router } from 'server/routers/router28';
const trpc = createReactQueryHooks<Router28Router>();

export const useRouter28Query = trpc.useQuery;
export const useRouter28InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter28Mutation = trpc.useMutation;
export const useRouter28Context = trpc.useContext;