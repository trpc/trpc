import { createReactQueryHooks } from '@trpc/react';    
import type { Random30Router } from 'server/routers/random30';
const trpc = createReactQueryHooks<Random30Router>();

export const useRandom30Query = trpc.useQuery;
export const useRandom30InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom30Mutation = trpc.useMutation;
export const useRandom30Context = trpc.useContext;