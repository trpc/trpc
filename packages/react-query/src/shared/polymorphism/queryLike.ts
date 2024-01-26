import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyProcedure,
  AnyRootConfigTypes,
  inferProcedureInput,
  inferProcedureOutput,
  inferTransformedProcedureOutput,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  InferQueryOptions,
  InferQueryResult,
} from '../../utils/inferReactQueryProcedure';
import type { UseTRPCSuspenseQueryResult } from '../hooks/types';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<
  TConfig extends AnyRootConfigTypes,
  TProcedure extends AnyProcedure,
> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TConfig, TProcedure, any>,
  ) => InferQueryResult<TConfig, TProcedure>;

  useSuspenseQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TConfig, TProcedure, any>,
  ) => UseTRPCSuspenseQueryResult<
    inferProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TConfig>
  >;
};

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<TQueryLike extends QueryLike<any, any>> =
  TQueryLike extends QueryLike<any, infer TProcedure>
    ? inferProcedureInput<TProcedure>
    : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<TQueryLike extends QueryLike<any, any>> =
  TQueryLike extends QueryLike<infer TConfig, infer TProcedure>
    ? inferTransformedProcedureOutput<TConfig, TProcedure>
    : never;
