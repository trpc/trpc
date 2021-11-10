import { createReactQueryHooks } from '@trpc/react';    
import type { Random11Router } from 'server/routers/random11';
const trpc = createReactQueryHooks<Random11Router>();

export const useRandom11Query = trpc.useQuery;
export const useRandom11InfiniteQuery = trpc.useInfiniteQuery;
export const useRandom11Mutation = trpc.useMutation;
export const useRandom11Context = trpc.useContext;