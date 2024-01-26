import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '../shared';

/**
 * @internal
 */
export type InferQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
  TData = inferTransformedProcedureOutput<TRoot, TProcedure>,
> = Omit<
  UseTRPCQueryOptions<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TRPCClientErrorLike<TRoot>,
    TData
  >,
  'select'
>;

/**
 * @internal
 */
export type InferMutationOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = UseTRPCMutationOptions<
  inferProcedureInput<TProcedure>,
  TRPCClientErrorLike<TRoot>,
  inferTransformedProcedureOutput<TRoot, TProcedure>
>;

/**
 * @internal
 */
export type InferQueryResult<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = UseTRPCQueryResult<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TRPCClientErrorLike<TRoot>
>;

/**
 * @internal
 */
export type InferMutationResult<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
  TContext = unknown,
> = UseTRPCMutationResult<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TRPCClientErrorLike<TRoot>,
  inferProcedureInput<TProcedure>,
  TContext
>;

export type inferReactQueryProcedureOptions<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? inferReactQueryProcedureOptions<TRouterOrProcedure>
      : TRouterOrProcedure extends AnyMutationProcedure
      ? InferMutationOptions<
          TRouter['_def']['_config']['$types'],
          TRouterOrProcedure
        >
      : TRouterOrProcedure extends AnyQueryProcedure
      ? InferQueryOptions<
          TRouter['_def']['_config']['$types'],
          TRouterOrProcedure
        >
      : never
    : never;
};
