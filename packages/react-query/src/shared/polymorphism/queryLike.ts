import { AnyProcedure, AnyRootConfig, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import {
  InferQueryOptions,
  InferQueryResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TProcedure extends AnyProcedure = AnyProcedure,
> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TConfig, TProcedure, any>,
  ) => InferQueryResult<TConfig, TProcedure>;
};

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<
  TQueryLike extends QueryLike<AnyRootConfig, AnyProcedure>,
> = TQueryLike extends QueryLike<any, infer TProcedure>
  ? inferProcedureInput<TProcedure>
  : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<
  TQueryLike extends QueryLike<AnyRootConfig, AnyProcedure>,
> = TQueryLike extends QueryLike<infer TConfig, infer TProcedure>
  ? inferTransformedProcedureOutput<TConfig, TProcedure>
  : never;
