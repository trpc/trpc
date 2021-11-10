import { createReactQueryHooks } from '@trpc/react';    
import type { Random46Router } from 'server/routers/random46';
const trpc = createReactQueryHooks<Random46Router>();

export const useRandom46Query = trpc.useQuery;
export const useRandom46InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom46Mutation = trpc.useMutation;
export const useRandom46Context = trpc.useContext;