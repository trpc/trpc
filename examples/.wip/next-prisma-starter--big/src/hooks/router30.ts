import { createReactQueryHooks } from '@trpc/react';    
import type { Router30Router } from 'server/routers/router30';
const trpc = createReactQueryHooks<Router30Router>();

export const useRouter30Query = trpc.useQuery;
export const useRouter30InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter30Mutation = trpc.useMutation;
export const useRouter30Context = trpc.useContext;