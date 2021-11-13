import { createReactQueryHooks } from '@trpc/react';    
import type { DogRouter } from 'server/routers/dog';
const trpc = createReactQueryHooks<DogRouter>();

export const useDogQuery = trpc.useQuery;
export const useDogInfiniteQuery = trpc.useInfiniteQuery;
export const useDogMutation = trpc.useMutation;
export const useDogContext = trpc.useContext;