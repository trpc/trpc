import { createReactQueryHooks } from '@trpc/react';    
import type { PostRouter } from 'server/routers/post';
const trpc = createReactQueryHooks<PostRouter>();

export const usePostQuery = trpc.useQuery;
export const usePostInfiniteQuery = trpc.useInfiniteQuery;
export const usePostMutation = trpc.useMutation;
export const usePostContext = trpc.useContext;