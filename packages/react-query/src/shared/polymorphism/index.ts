import {
  InferMutationOptions,
  InferMutationResult,
  InferQueryOptions,
  InferQueryResult,
} from '@trpc/react-query/utils/inferReactQueryProcedure';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  inferProcedureInput,
} from '@trpc/server';
import { DecoratedProcedureUtilsRecord } from '../proxy/utilsProxy';

/**
 * Use to request a mutation route which matches a given mutation procedure's interface
 */
export type MutationLike<TProcedure extends AnyProcedure> = {
  useMutation: (
    opts?: InferMutationOptions<TProcedure>,
  ) => InferMutationResult<TProcedure>;
};

/**
 * Use to request a query route which matches a given query procedure's interface
 */
export type QueryLike<TProcedure extends AnyProcedure> = {
  useQuery: (
    variables: inferProcedureInput<TProcedure>,
    opts?: InferQueryOptions<TProcedure, any>,
  ) => InferQueryResult<TProcedure>;
};

/**
 * Use to request a route path which matches a given route's interface
 */
export type RouterLike<
  TRouter extends AnyRouter,
  TRecord extends TRouter['_def']['record'] = TRouter['_def']['record'],
> = {
  [key in keyof TRecord]: TRecord[key] extends AnyRouter
    ? RouterLike<TRecord[key]>
    : TRecord[key] extends AnyQueryProcedure
    ? QueryLike<TRecord[key]>
    : TRecord[key] extends AnyMutationProcedure
    ? MutationLike<TRecord[key]>
    : never;
};

/**
 * Use to request a Utils/Context path which matches the given route's interface
 */
export type UtilsLike<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<TRouter>;
