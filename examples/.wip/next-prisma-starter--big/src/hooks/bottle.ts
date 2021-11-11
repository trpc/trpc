import { createReactQueryHooks } from '@trpc/react';    
import type { BottleRouter } from 'server/routers/bottle';
const trpc = createReactQueryHooks<BottleRouter>();

export const useBottleQuery = trpc.useQuery;
export const useBottleInfiniteQuery = trpc.useInfiniteQuery;
export const useBottleMutation = trpc.useMutation;
export const useBottleContext = trpc.useContext;