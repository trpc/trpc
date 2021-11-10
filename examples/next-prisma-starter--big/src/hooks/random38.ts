import { createReactQueryHooks } from '@trpc/react';    
import type { Random38Router } from 'server/routers/random38';
const trpc = createReactQueryHooks<Random38Router>();

export const useRandom38Query = trpc.useQuery;
export const useRandom38InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom38Mutation = trpc.useMutation;
export const useRandom38Context = trpc.useContext;