import { createReactQueryHooks } from '@trpc/react';    
import type { BookcaseRouter } from 'server/routers/bookcase';
const trpc = createReactQueryHooks<BookcaseRouter>();

export const useBookcaseQuery = trpc.useQuery;
export const useBookcaseMutation = trpc.useMutation;
export const useBookcaseContext = trpc.useContext;