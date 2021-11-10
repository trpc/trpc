import { createReactQueryHooks } from '@trpc/react';    
import type { Random31Router } from 'server/routers/random31';
const trpc = createReactQueryHooks<Random31Router>();

export const useRandom31Query = trpc.useQuery;
export const useRandom31InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom31Mutation = trpc.useMutation;
export const useRandom31Context = trpc.useContext;