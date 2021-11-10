import { createReactQueryHooks } from '@trpc/react';    
import type { AnimalRouter } from 'server/routers/animal';
const trpc = createReactQueryHooks<AnimalRouter>();

export const useAnimalQuery = trpc.useQuery;
export const useAnimalMutation = trpc.useMutation;
export const useAnimalContext = trpc.useContext;