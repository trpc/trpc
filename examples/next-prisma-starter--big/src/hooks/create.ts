import { createReactQueryHooks } from '@trpc/react';    
import type { CreateRouter } from 'server/routers/create';
const trpc = createReactQueryHooks<CreateRouter>();

export const useCreateQuery = trpc.useQuery;
export const useCreateInfiniteQuery = trpc.useInfiniteQuery;
export const useCreateMutation = trpc.useMutation;
export const useCreateContext = trpc.useContext;