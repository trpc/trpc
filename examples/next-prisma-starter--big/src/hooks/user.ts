import { createReactQueryHooks } from '@trpc/react';    
import type { UserRouter } from 'server/routers/user';
const trpc = createReactQueryHooks<UserRouter>();

export const useUserQuery = trpc.useQuery;
export const useUserMutation = trpc.useMutation;