import { createReactQueryHooks } from '@trpc/react';    
import type { Router27Router } from 'server/routers/router27';
const trpc = createReactQueryHooks<Router27Router>();

export const useRouter27Query = trpc.useQuery;
export const useRouter27InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter27Mutation = trpc.useMutation;
export const useRouter27Context = trpc.useContext;