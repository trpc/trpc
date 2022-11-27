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

type InferQueryOptions<
  TProcedure extends AnyProcedure,
  TPath extends string,
> = Omit<
  UseTRPCQueryOptions<
    TPath,
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

type InferReactQueryProcedureOptions<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? InferReactQueryProcedureOptions<
          TRouterOrProcedure,
          `${TPath}${TKey & string}.`
        >
      : TRouterOrProcedure extends AnyProcedure
      ? TRouterOrProcedure extends AnyMutationProcedure
        ? {
            options: InferMutationOptions<TRouterOrProcedure>;
          }
        : TRouterOrProcedure extends AnyQueryProcedure
        ? {
            options: InferQueryOptions<
              TRouterOrProcedure,
              `${TPath}${TKey & string}`
            >;
            input: inferProcedureInput<TRouterOrProcedure>;
          }
        : never
      : never
    : never;
};

export type { InferReactQueryProcedureOptions };
