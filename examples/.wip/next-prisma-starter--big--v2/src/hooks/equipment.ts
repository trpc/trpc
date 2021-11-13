import { createReactQueryHooks } from '@trpc/react';    
import type { EquipmentRouter } from 'server/routers/equipment';
const trpc = createReactQueryHooks<EquipmentRouter>();

export const useEquipmentQuery = trpc.useQuery;
export const useEquipmentInfiniteQuery = trpc.useInfiniteQuery;
export const useEquipmentMutation = trpc.useMutation;
export const useEquipmentContext = trpc.useContext;