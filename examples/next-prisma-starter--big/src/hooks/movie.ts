import { createReactQueryHooks } from '@trpc/react';    
import type { MovieRouter } from 'server/routers/movie';
const trpc = createReactQueryHooks<MovieRouter>();

export const useMovieQuery = trpc.useQuery;
export const useMovieMutation = trpc.useMutation;