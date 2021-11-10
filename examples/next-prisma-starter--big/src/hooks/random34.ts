import { createReactQueryHooks } from '@trpc/react';    
import type { Random34Router } from 'server/routers/random34';
const trpc = createReactQueryHooks<Random34Router>();

export const useRandom34Query = trpc.useQuery;
export const useRandom34InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom34Mutation = trpc.useMutation;
export const useRandom34Context = trpc.useContext;