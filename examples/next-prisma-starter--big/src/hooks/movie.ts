import { createReactQueryHooks } from '@trpc/react';    
import type { MovieRouter } from 'server/routers/movie';
const trpc = createReactQueryHooks<MovieRouter>();

export const useMovieQuery = trpc.useQuery;
export const useMovieInfiniteQuery = trpc.useInfiniteQuery;
export const useMovieMutation = trpc.useMutation;
export const useMovieContext = trpc.useContext;