import { createReactQueryHooks } from '@trpc/react';    
import type { CalendarRouter } from 'server/routers/calendar';
const trpc = createReactQueryHooks<CalendarRouter>();

export const useCalendarQuery = trpc.useQuery;
export const useCalendarInfiniteQuery = trpc.useInfiniteQuery;
export const useCalendarMutation = trpc.useMutation;
export const useCalendarContext = trpc.useContext;