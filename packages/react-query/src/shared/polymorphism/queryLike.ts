import {
  DecoratedQuery,
  DecoratedQueryMethods,
} from '@trpc/react-query/createTRPCReact';
import { AnyProcedure, AnyRootConfig, inferProcedureInput } from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TProcedure extends AnyProcedure = AnyProcedure,
> = DecoratedQuery<TConfig, TProcedure>;

/**
 * Use to unwrap a QueryLike's input
 */
export type InferQueryLikeInput<
  TQueryLike extends DecoratedQueryMethods<AnyRootConfig, any>,
> = TQueryLike extends DecoratedQueryMethods<any, infer TProcedure>
  ? inferProcedureInput<TProcedure>
  : never;

/**
 * Use to unwrap a QueryLike's data output
 */
export type InferQueryLikeData<
  TQueryLike extends DecoratedQueryMethods<AnyRootConfig, any>,
> = TQueryLike extends DecoratedQueryMethods<infer TConfig, infer TProcedure>
  ? inferTransformedProcedureOutput<TConfig, TProcedure>
  : never;
