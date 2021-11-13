import { createReactQueryHooks } from '@trpc/react';    
import type { Router39Router } from 'server/routers/router39';
const trpc = createReactQueryHooks<Router39Router>();

export const useRouter39Query = trpc.useQuery;
export const useRouter39InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter39Mutation = trpc.useMutation;
export const useRouter39Context = trpc.useContext;