import { createReactQueryHooks } from '@trpc/react';    
import type { Random9Router } from 'server/routers/random9';
const trpc = createReactQueryHooks<Random9Router>();

export const useRandom9Query = trpc.useQuery;
export const useRandom9InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom9Mutation = trpc.useMutation;
export const useRandom9Context = trpc.useContext;