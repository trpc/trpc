import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  inferProcedureInput,
} from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
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
  TProcedure extends AnyProcedure,
  TPath extends string,
  TData = inferTransformedProcedureOutput<TProcedure>,
> = Omit<
  UseTRPCQueryOptions<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TProcedure>,
    TData
  >,
  'select'
>;

/**
 * @internal
 */
export type InferMutationOptions<TProcedure extends AnyProcedure> =
  UseTRPCMutationOptions<
    inferProcedureInput<TProcedure>,
    TRPCClientErrorLike<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>
  >;

/**
 * @internal
 */
export type InferQueryResult<TProcedure extends AnyProcedure> =
  UseTRPCQueryResult<
    inferTransformedProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TProcedure>
  >;

/**
 * @internal
 */
export type InferMutationResult<
  TProcedure extends AnyProcedure,
  TContext = unknown,
> = UseTRPCMutationResult<
  inferTransformedProcedureOutput<TProcedure>,
  TRPCClientErrorLike<TProcedure>,
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
      ? InferMutationOptions<TRouterOrProcedure>
      : TRouterOrProcedure extends AnyQueryProcedure
      ? InferQueryOptions<TRouterOrProcedure, `${TPath}${TKey & string}`>
      : never
    : never;
};
