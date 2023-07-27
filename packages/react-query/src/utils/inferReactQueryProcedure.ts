import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  inferProcedureInput,
} from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import {
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '../shared';

/**
 * @internal
 */
export type InferQueryOptions<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
  TPath extends string,
  TData = inferTransformedProcedureOutput<TRouter, TProcedure>,
> = Omit<
  UseTRPCQueryOptions<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TRouter, TProcedure>,
    inferTransformedProcedureOutput<TRouter, TProcedure>,
    TRPCClientErrorLike<TRouter>,
    TData
  >,
  'select'
>;

/**
 * @internal
 */
export type InferMutationOptions<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
> = UseTRPCMutationOptions<
  inferProcedureInput<TProcedure>,
  TRPCClientErrorLike<TRouter>,
  inferTransformedProcedureOutput<TRouter, TProcedure>
>;

/**
 * @internal
 */
export type InferQueryResult<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
> = UseTRPCQueryResult<
  inferTransformedProcedureOutput<TRouter, TProcedure>,
  TRPCClientErrorLike<TRouter>
>;

/**
 * @internal
 */
export type InferMutationResult<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
  TContext = unknown,
> = UseTRPCMutationResult<
  inferTransformedProcedureOutput<TRouter, TProcedure>,
  TRPCClientErrorLike<TRouter>,
  inferProcedureInput<TProcedure>,
  TContext
>;

export type inferReactQueryProcedureOptions<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? inferReactQueryProcedureOptions<
          TRouterOrProcedure,
          `${TPath}${TKey & string}.`
        >
      : TRouterOrProcedure extends AnyMutationProcedure
      ? InferMutationOptions<TRouter, TRouterOrProcedure>
      : TRouterOrProcedure extends AnyQueryProcedure
      ? InferQueryOptions<
          TRouter,
          TRouterOrProcedure,
          `${TPath}${TKey & string}`
        >
      : never
    : never;
};
