import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { UseTRPCMutationOptions, UseTRPCQueryOptions } from '../shared';

type InferQueryOptions<TProcedure extends AnyProcedure> = Omit<
  UseTRPCQueryOptions<
    '',
    inferProcedureInput<TProcedure>,
    inferProcedureOutput<TProcedure>,
    inferProcedureOutput<TProcedure>,
    TRPCClientErrorLike<TProcedure>
  >,
  'select'
>;

type InferMutationOptions<TProcedure extends AnyProcedure> =
  UseTRPCMutationOptions<
    inferProcedureInput<TProcedure>,
    TRPCClientErrorLike<TProcedure>,
    inferProcedureOutput<TProcedure>
  >;

type InferReactQueryProcedureOptions<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? InferReactQueryProcedureOptions<TRouterOrProcedure>
      : TRouterOrProcedure extends AnyProcedure
      ? TRouterOrProcedure extends AnyMutationProcedure
        ? {
            options: InferMutationOptions<TRouterOrProcedure>;
          }
        : TRouterOrProcedure extends AnyQueryProcedure
        ? {
            options: InferQueryOptions<TRouterOrProcedure>;
            input: inferProcedureInput<TRouterOrProcedure>;
          }
        : never
      : never
    : never;
};

export type { InferReactQueryProcedureOptions };
