import { createReactQueryHooks } from '@trpc/react';    
import type { Random43Router } from 'server/routers/random43';
const trpc = createReactQueryHooks<Random43Router>();

export const useRandom43Query = trpc.useQuery;
export const useRandom43InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom43Mutation = trpc.useMutation;
export const useRandom43Context = trpc.useContext;