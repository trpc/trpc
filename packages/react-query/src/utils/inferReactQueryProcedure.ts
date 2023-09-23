import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
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
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
  TData = inferTransformedProcedureOutput<TConfig, TProcedure>,
> = Omit<
  UseTRPCQueryOptions<
    inferTransformedProcedureOutput<TConfig, TProcedure>,
    inferTransformedProcedureOutput<TConfig, TProcedure>,
    TRPCClientErrorLike<TConfig>,
    TData
  >,
  'select'
>;

/**
 * @internal
 */
export type InferMutationOptions<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = UseTRPCMutationOptions<
  inferProcedureInput<TProcedure>,
  TRPCClientErrorLike<TConfig>,
  inferTransformedProcedureOutput<TConfig, TProcedure>
>;

/**
 * @internal
 */
export type InferQueryResult<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = UseTRPCQueryResult<
  inferTransformedProcedureOutput<TConfig, TProcedure>,
  TRPCClientErrorLike<TConfig>
>;

/**
 * @internal
 */
export type InferMutationResult<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
  TContext = unknown,
> = UseTRPCMutationResult<
  inferTransformedProcedureOutput<TConfig, TProcedure>,
  TRPCClientErrorLike<TConfig>,
  inferProcedureInput<TProcedure>,
  TContext
>;

export type inferReactQueryProcedureOptions<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? inferReactQueryProcedureOptions<TRouterOrProcedure>
      : TRouterOrProcedure extends AnyMutationProcedure
      ? InferMutationOptions<TRouter['_def']['_config'], TRouterOrProcedure>
      : TRouterOrProcedure extends AnyQueryProcedure
      ? InferQueryOptions<TRouter['_def']['_config'], TRouterOrProcedure>
      : never
    : never;
};
