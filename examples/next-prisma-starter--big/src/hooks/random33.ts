import { createReactQueryHooks } from '@trpc/react';    
import type { Random33Router } from 'server/routers/random33';
const trpc = createReactQueryHooks<Random33Router>();

export const useRandom33Query = trpc.useQuery;
export const useRandom33InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom33Mutation = trpc.useMutation;
export const useRandom33Context = trpc.useContext;