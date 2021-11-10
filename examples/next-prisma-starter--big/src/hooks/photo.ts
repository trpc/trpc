import { createReactQueryHooks } from '@trpc/react';    
import type { PhotoRouter } from 'server/routers/photo';
const trpc = createReactQueryHooks<PhotoRouter>();

export const usePhotoQuery = trpc.useQuery;
export const usePhotoMutation = trpc.useMutation;
export const usePhotoContext = trpc.useContext;