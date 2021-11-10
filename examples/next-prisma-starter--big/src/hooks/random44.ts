import { createReactQueryHooks } from '@trpc/react';    
import type { Random44Router } from 'server/routers/random44';
const trpc = createReactQueryHooks<Random44Router>();

export const useRandom44Query = trpc.useQuery;
export const useRandom44InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom44Mutation = trpc.useMutation;
export const useRandom44Context = trpc.useContext;