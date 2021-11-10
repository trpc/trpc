import { createReactQueryHooks } from '@trpc/react';    
import type { SettingRouter } from 'server/routers/setting';
const trpc = createReactQueryHooks<SettingRouter>();

export const useSettingQuery = trpc.useQuery;
export const useSettingInfiniteQuery = trpc.useInfiniteQuery;
export const useSettingMutation = trpc.useMutation;
export const useSettingContext = trpc.useContext;