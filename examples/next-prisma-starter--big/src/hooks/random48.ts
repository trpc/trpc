import { createReactQueryHooks } from '@trpc/react';    
import type { Random48Router } from 'server/routers/random48';
const trpc = createReactQueryHooks<Random48Router>();

export const useRandom48Query = trpc.useQuery;
export const useRandom48InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom48Mutation = trpc.useMutation;
export const useRandom48Context = trpc.useContext;