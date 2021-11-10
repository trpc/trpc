import { createReactQueryHooks } from '@trpc/react';    
import type { Random4Router } from 'server/routers/random4';
const trpc = createReactQueryHooks<Random4Router>();

export const useRandom4Query = trpc.useQuery;
export const useRandom4InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom4Mutation = trpc.useMutation;
export const useRandom4Context = trpc.useContext;