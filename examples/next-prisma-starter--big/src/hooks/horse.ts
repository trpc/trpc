import { createReactQueryHooks } from '@trpc/react';    
import type { HorseRouter } from 'server/routers/horse';
const trpc = createReactQueryHooks<HorseRouter>();

export const useHorseQuery = trpc.useQuery;
export const useHorseMutation = trpc.useMutation;
export const useHorseContext = trpc.useContext;