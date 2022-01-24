import type { TRPCClientErrorLike } from '@trpc/client';
import type { UseTRPCQueryOptions } from '@trpc/react';
import type {
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import type { QueryObserverSuccessResult } from 'react-query';
import type { AppRouter } from 'server/routers/_app';
import { trpc } from './trpc';

type TRouter = AppRouter;
type TError = TRPCClientErrorLike<TRouter>;
type TQueries = TRouter['_def']['queries'];

/**
 * This hook returns a guaranteed `{ data: TData }` & not `{ data: undefined | TData }`
 * Any errors are propagated to nearest error container and loading is propagated to closest `<Suspense />`
 *
 * tRPC in it's current version was written before I started properly using Suspsense.
 * This sort of hook will come in tRPC in the next major and likely become the default behaviour.
 * @returns
 * A `[TData, QueryObserverSuccessResult]`-tuple, where you usually only need the first part.
 */
export function useSuspenseQuery<TPath extends keyof TQueries & string>(
  pathAndInput: [path: TPath, ...args: inferHandlerInput<TQueries[TPath]>],
  opts?: UseTRPCQueryOptions<
    TPath,
    inferProcedureInput<TQueries[TPath]>,
    inferProcedureOutput<TQueries[TPath]>,
    TError
  >,
): [
  inferProcedureOutput<TQueries[TPath]>,
  QueryObserverSuccessResult<inferProcedureOutput<TQueries[TPath]>, TError>,
] {
  // enforce suspense
  const _opts = opts ?? {};
  _opts.suspense = true;

  const query = trpc.useQuery(
    pathAndInput,
    _opts as any,
  ) as any as QueryObserverSuccessResult<
    inferProcedureOutput<TQueries[TPath]>,
    TError
  >;

  return [query.data, query];
}
