import { createReactQueryHooks } from '@trpc/react';    
import type { ContentRouter } from 'server/routers/content';
const trpc = createReactQueryHooks<ContentRouter>();

export const useContentQuery = trpc.useQuery;
export const useContentMutation = trpc.useMutation;
export const useContentContext = trpc.useContext;