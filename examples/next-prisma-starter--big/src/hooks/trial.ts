import { createReactQueryHooks } from '@trpc/react';    
import type { TrialRouter } from 'server/routers/trial';
const trpc = createReactQueryHooks<TrialRouter>();

export const useTrialQuery = trpc.useQuery;
export const useTrialInfiniteQuery = trpc.useInfiniteQuery;
export const useTrialMutation = trpc.useMutation;
export const useTrialContext = trpc.useContext;