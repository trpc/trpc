import { createReactQueryHooks } from '@trpc/react';    
import type { Random21Router } from 'server/routers/random21';
const trpc = createReactQueryHooks<Random21Router>();

export const useRandom21Query = trpc.useQuery;
export const useRandom21InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom21Mutation = trpc.useMutation;
export const useRandom21Context = trpc.useContext;