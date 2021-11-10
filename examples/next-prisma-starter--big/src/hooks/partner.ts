import { createReactQueryHooks } from '@trpc/react';    
import type { PartnerRouter } from 'server/routers/partner';
const trpc = createReactQueryHooks<PartnerRouter>();

export const usePartnerQuery = trpc.useQuery;
export const usePartnerMutation = trpc.useMutation;