import { createReactQueryHooks } from '@trpc/react';    
import type { CatRouter } from 'server/routers/cat';
const trpc = createReactQueryHooks<CatRouter>();

export const useCatQuery = trpc.useQuery;
export const useCatMutation = trpc.useMutation;