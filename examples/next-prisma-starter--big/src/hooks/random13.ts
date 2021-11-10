import { createReactQueryHooks } from '@trpc/react';    
import type { Random13Router } from 'server/routers/random13';
const trpc = createReactQueryHooks<Random13Router>();

export const useRandom13Query = trpc.useQuery;
export const useRandom13InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom13Mutation = trpc.useMutation;
export const useRandom13Context = trpc.useContext;