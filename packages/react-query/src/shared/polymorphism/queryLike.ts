import { AnyProcedure, AnyRouter, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import {
  InferQueryOptions,
  InferQueryResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure = AnyProcedure,
> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TRouter, TProcedure, any, any>,
  ) => InferQueryResult<TRouter, TProcedure>;
};

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<
  TRouter extends AnyRouter,
  TQueryLike extends QueryLike<TRouter>,
> = TQueryLike extends QueryLike<any, infer TProcedure>
  ? inferProcedureInput<TProcedure>
  : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<
  TRouter extends AnyRouter,
  TQueryLike extends QueryLike<TRouter>,
> = TQueryLike extends QueryLike<any, infer TProcedure>
  ? inferTransformedProcedureOutput<TRouter, TProcedure>
  : never;
