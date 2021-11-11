import { createReactQueryHooks } from '@trpc/react';    
import type { Router36Router } from 'server/routers/router36';
const trpc = createReactQueryHooks<Router36Router>();

export const useRouter36Query = trpc.useQuery;
export const useRouter36InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter36Mutation = trpc.useMutation;
export const useRouter36Context = trpc.useContext;