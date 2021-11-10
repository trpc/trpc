import { createReactQueryHooks } from '@trpc/react';    
import type { Router31Router } from 'server/routers/router31';
const trpc = createReactQueryHooks<Router31Router>();

export const useRouter31Query = trpc.useQuery;
export const useRouter31InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter31Mutation = trpc.useMutation;
export const useRouter31Context = trpc.useContext;