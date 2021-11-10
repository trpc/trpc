import { createReactQueryHooks } from '@trpc/react';    
import type { Random27Router } from 'server/routers/random27';
const trpc = createReactQueryHooks<Random27Router>();

export const useRandom27Query = trpc.useQuery;
export const useRandom27InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom27Mutation = trpc.useMutation;
export const useRandom27Context = trpc.useContext;