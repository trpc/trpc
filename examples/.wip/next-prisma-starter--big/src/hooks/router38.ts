import { createReactQueryHooks } from '@trpc/react';    
import type { Router38Router } from 'server/routers/router38';
const trpc = createReactQueryHooks<Router38Router>();

export const useRouter38Query = trpc.useQuery;
export const useRouter38InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter38Mutation = trpc.useMutation;
export const useRouter38Context = trpc.useContext;