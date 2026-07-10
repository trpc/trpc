import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyProcedure,
  AnyRootTypes,
  inferProcedureInput,
  inferProcedureOutput,
  inferTransformedProcedureOutput,
} from '@trpc/server/unstable-core-do-not-import';
import type { DecoratedQuery } from '../../createTRPCReact';
import type {
  InferQueryOptions,
  InferQueryResult,
} from '../../utils/inferReactQueryProcedure';
import type { UseTRPCSuspenseQueryResult } from '../hooks/types';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TRoot, TProcedure, any>,
  ) => InferQueryResult<TRoot, TProcedure>;

  useSuspenseQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TRoot, TProcedure, any>,
  ) => UseTRPCSuspenseQueryResult<
    inferProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TRoot>
  >;
};

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<TQueryLike> =
  TQueryLike extends DecoratedQuery<infer $Def>
    ? $Def['input']
    : TQueryLike extends QueryLike<any, infer TProcedure>
      ? inferProcedureInput<TProcedure>
      : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<TQueryLike> =
  TQueryLike extends DecoratedQuery<infer $Def>
    ? $Def['output']
    : TQueryLike extends QueryLike<infer TRoot, infer TProcedure>
      ? inferTransformedProcedureOutput<TRoot, TProcedure>
      : never;
