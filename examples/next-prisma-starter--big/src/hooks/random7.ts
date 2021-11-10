import { createReactQueryHooks } from '@trpc/react';    
import type { Random7Router } from 'server/routers/random7';
const trpc = createReactQueryHooks<Random7Router>();

export const useRandom7Query = trpc.useQuery;
export const useRandom7InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom7Mutation = trpc.useMutation;
export const useRandom7Context = trpc.useContext;