import { createReactQueryHooks } from '@trpc/react';    
import type { BagRouter } from 'server/routers/bag';
const trpc = createReactQueryHooks<BagRouter>();

export const useBagQuery = trpc.useQuery;
export const useBagMutation = trpc.useMutation;
export const useBagContext = trpc.useContext;