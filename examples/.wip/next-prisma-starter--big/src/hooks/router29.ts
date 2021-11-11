import { createReactQueryHooks } from '@trpc/react';    
import type { Router29Router } from 'server/routers/router29';
const trpc = createReactQueryHooks<Router29Router>();

export const useRouter29Query = trpc.useQuery;
export const useRouter29InfiniteQuery = trpc.useInfiniteQuery;
export const useRouter29Mutation = trpc.useMutation;
export const useRouter29Context = trpc.useContext;