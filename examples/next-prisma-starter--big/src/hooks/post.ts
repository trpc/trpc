import { createReactQueryHooks } from '@trpc/react';    
import type { PostRouter } from 'server/routers/post';
const trpc = createReactQueryHooks<PostRouter>();

export const usePostQuery = trpc.useQuery;
export const usePostMutation = trpc.useMutation;