import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  RouterRecord,
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
  'select' | 'queryFn'
>;

/**
 * @internal
 */
export type InferMutationOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
  TMeta = unknown,
> = UseTRPCMutationOptions<
  inferProcedureInput<TProcedure>,
  TRPCClientErrorLike<TRoot>,
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TMeta
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

type inferReactQueryProcedureOptionsInner<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? InferQueryOptions<TRoot, $Value>
      : $Value extends AnyMutationProcedure
        ? InferMutationOptions<TRoot, $Value>
        : $Value extends RouterRecord
          ? inferReactQueryProcedureOptionsInner<TRoot, $Value>
          : never
    : never;
};

export type inferReactQueryProcedureOptions<TRouter extends AnyRouter> =
  inferReactQueryProcedureOptionsInner<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;
