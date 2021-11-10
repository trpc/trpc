import { createReactQueryHooks } from '@trpc/react';    
import type { ListRouter } from 'server/routers/list';
const trpc = createReactQueryHooks<ListRouter>();

export const useListQuery = trpc.useQuery;
export const useListMutation = trpc.useMutation;