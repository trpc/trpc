import type { AnyProcedure, inferProcedureInput } from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import type {
  InferQueryOptions,
  InferQueryResult,
} from '../../utils/inferReactQueryProcedure';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<TProcedure extends AnyProcedure = AnyProcedure> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TProcedure, any, any>,
  ) => InferQueryResult<TProcedure>;
};

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<TQueryLike extends QueryLike> =
  TQueryLike extends QueryLike<infer TProcedure>
    ? inferProcedureInput<TProcedure>
    : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<TQueryLike extends QueryLike> =
  TQueryLike extends QueryLike<infer TProcedure>
    ? inferTransformedProcedureOutput<TProcedure>
    : never;
